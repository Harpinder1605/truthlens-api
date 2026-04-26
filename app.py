from flask import Flask, request, jsonify
from flask_cors import CORS
from sklearn.metrics.pairwise import cosine_similarity
import joblib
import math

# Import the transcript API and other utilities
from youtube_transcript_api import YouTubeTranscriptApi
import requests
import csv
import os
from dotenv import load_dotenv

# Load variables from .env file into the environment
load_dotenv()

import threading
import subprocess
from textblob import TextBlob
from groq import Groq
from pymongo import MongoClient

# --- FEATURE 2 & 5 Setup: Cloud DB and Groq API ---
MONGO_URI = os.environ.get("MONGO_URI")
db = None
if MONGO_URI:
    mongo_client = MongoClient(MONGO_URI)
    db = mongo_client['truthlens']

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

app = Flask(__name__)
CORS(app)

# Load the AI Brain
try:
    svm_model = joblib.load('clickbait_model.pkl')
    svm_vectorizer = joblib.load('vectorizer.pkl')
except Exception as e:
    print("Error loading models:", e)

@app.route('/api/analyze', methods=['POST'])
def analyze():
    data = request.json
    if not data or 'headline' not in data or 'body' not in data:
        return jsonify({"error": "Missing data"}), 400
        
    headline = data['headline']
    body = data['body']
    has_media = data.get('hasMedia', False)
    video_id = data.get('videoId') # Grab the video ID if it was sent
    author = data.get('author', '') # Grab the extracted author/channel
    domain = data.get('domain', '')
    
    # --- Transcript Fetching Logic ---
    transcript_found = False
    if video_id:
        try:
            api = YouTubeTranscriptApi()
            raw_result = api.fetch(video_id)
            
            transcript_segments = []
            if hasattr(raw_result, 'to_raw_data'):
                raw_result = raw_result.to_raw_data()
                
            for segment in raw_result:
                if isinstance(segment, dict) and 'text' in segment:
                    transcript_segments.append(segment['text'])
                elif hasattr(segment, 'text'):
                    transcript_segments.append(segment.text)
                    
            transcript_text = " ".join(transcript_segments)
            
            if len(transcript_text.split()) > 20:
                body = transcript_text
                transcript_found = True
        except Exception as e:
            print(f"Could not fetch transcript for video {video_id}: {e}")

    word_count = len(body.split())

    # --- EDGE CASE: Video/Media Content with low text ---
    if word_count < 10:
        if has_media or video_id:
            return jsonify({
                "headline": headline,
                "svm_flag": False,
                "similarity_score": 0,
                "final_warning": False,
                "message": "Media Content: No subtitles available to verify." if video_id else "Media Content: Not enough text to verify.",
                "risk_percentage": 0,
                "word_count": word_count,
                "read_time": 0,
                "trigger_words": [],
                "is_media": True
            })
        else:
            return jsonify({"error": "Not enough text content found to analyze."}), 400

    # --- 1. Cosine Similarity ---
    tfidf_matrix = svm_vectorizer.transform([headline, body])
    sim_score = float(cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0])

    # --- 2. SVM Classification ---
    headline_vector = svm_vectorizer.transform([headline])
    svm_prediction = svm_model.predict(headline_vector)[0]
    is_clickbait_svm = bool(int(svm_prediction) == 1)

    # --- FEATURE 1: Risk Confidence Percentage ---
    distance = svm_model.decision_function(headline_vector)[0]
    svm_prob = 1 / (1 + math.exp(-distance))
    
    if transcript_found:
        # Spoken language rarely matches video titles exactly. 
        # Ignore the cosine similarity penalty entirely for videos and trust the SVM.
        risk_percentage = int(svm_prob * 100)
    else:
        risk_percentage = int(((svm_prob * 0.6) + ((1 - sim_score) * 0.4)) * 100)
        
    risk_percentage = max(0, min(100, risk_percentage))

    # --- FEATURE 2: Read Time & Content Depth ---
    read_time = max(1, round(word_count / 250))

    # --- FEATURE 3: Emotion & Sensationalism Profiling (NLP) ---
    analysis_text = f"{headline} {body[:500]}"
    blob = TextBlob(analysis_text)
    emotion_score = int((abs(blob.sentiment.polarity) * 0.4 + blob.sentiment.subjectivity * 0.6) * 100)

    # --- FEATURE 4: Google Fact-Check API Integration ---
    debunked_link = None
    fact_check_title = None
    try:
        api_key = os.environ.get("GOOGLE_FACT_CHECK_API_KEY")
        
        if api_key:
            fact_check_url = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
            fc_response = requests.get(fact_check_url, params={"query": headline, "key": api_key}, timeout=5)
            
            if fc_response.status_code == 200:
                fc_data = fc_response.json()
                if 'claims' in fc_data:
                    # FIX: Loop through ALL claims instead of just the first one!
                    for claim in fc_data['claims']:
                        if 'claimReview' in claim and len(claim['claimReview']) > 0:
                            review = claim['claimReview'][0]
                            textual_rating = review.get('textualRating', '').lower()
                            
                            # FIX: Expanded list of fact-checker trigger words
                            bad_ratings = ['false', 'misleading', 'altered', 'fake', 'satire', 'pants on fire', 'unproven', 'unsupported', 'incorrect', 'fiction']
                            
                            if any(bad_rating in textual_rating for bad_rating in bad_ratings):
                                debunked_link = review.get('url')
                                fact_check_title = claim.get('text', 'Debunked Claim')
                                break # Found a debunk match, stop looping!
        else:
            print("Skipping Fact Check: No API Key found in environment variables.")
    except Exception as e:
        print("Fact check API failed:", e)

    # --- FEATURE 3: Explainable AI (Trigger Words) ---
    headline_words = [ "".join(c for c in word if c.isalnum()) for word in headline.lower().split() ]
    trigger_words = []
    vocab = svm_vectorizer.vocabulary_
    coefs = svm_model.coef_[0]
    
    for word in headline_words:
        if word in vocab:
            idx = vocab[word]
            weight = coefs[idx]
            if weight > 0.4: 
                trigger_words.append(word)
                
    trigger_words = list(set(trigger_words))

    # --- Smarter Verdict Logic ---
    is_media_flag = False
     
    if not transcript_found and has_media and (word_count < 80 or sim_score < 0.15):
        is_media_flag = True
        final_warning = False
        verdict_msg = "Media Content: Context is inside the video."
        risk_percentage = 0
        sim_score = 0
    elif transcript_found:
        # Custom logic for YouTube/Videos: Ignore similarity score, rely purely on SVM probability
        if is_clickbait_svm and svm_prob > 0.80:
            final_warning = True
            verdict_msg = "High Risk: Clickbait Video Title!"
        elif is_clickbait_svm:
            final_warning = False
            verdict_msg = "Sensational Video Title."
        else:
            final_warning = False
            verdict_msg = "Seems Reliable."
    elif is_clickbait_svm and sim_score >= 0.25:
        final_warning = False
        verdict_msg = "Sensational, but verifiable."
    elif is_clickbait_svm and sim_score < 0.25:
        final_warning = True
        verdict_msg = "High Risk: Clickbait!"
    elif not is_clickbait_svm and sim_score < 0.10:
        final_warning = True
        verdict_msg = "High Risk: Misleading Content!"
    else:
        final_warning = False
        verdict_msg = "Seems Reliable."

    # --- FEATURE 2: Global Domain Trust ---
    domain_trust = 85
    if db is not None and domain:
        domain_record = db.domains.find_one({"domain": domain})
        if domain_record:
            total_flags = domain_record.get("flags", 0)
            total_scans = domain_record.get("total_scans", 1)
            penalty = (total_flags / total_scans) * 100
            domain_trust = max(10, int(100 - penalty))

    # --- FEATURE 5: Explainable AI (XAI) using Groq ---
    ai_explanation = None
    if final_warning and groq_client:
        try:
            prompt = f"In one short sentence, explain why this headline might be misleading or clickbait based on the text. Headline: '{headline}'. Text: '{body[:400]}'"
            chat_completion = groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.1-8b-instant",
            )
            ai_explanation = chat_completion.choices[0].message.content.strip()
        except Exception as e:
            print("Groq XAI Error:", e)

    response = {
        "headline": headline,
        "svm_flag": is_clickbait_svm,
        "similarity_score": round(sim_score, 2),
        "final_warning": final_warning,
        "message": verdict_msg,
        "risk_percentage": risk_percentage,
        "word_count": word_count,
        "read_time": read_time,
        "trigger_words": trigger_words,
        "is_media": is_media_flag,
        "debunked_link": debunked_link,
        "fact_check_title": fact_check_title,
        "emotion_score": emotion_score,
        "ai_explanation": ai_explanation,
        "domain_trust": domain_trust
    }

    return jsonify(response)

# --- Crowdsourced Feedback API ---
@app.route('/api/feedback', methods=['POST'])
def feedback():
    data = request.json
    if not data:
        return jsonify({"error": "No data"}), 400
        
    headline = data.get('headline', '')
    is_clickbait = data.get('is_clickbait', False)
    user_agrees = data.get('user_agrees', True)
    domain = data.get('domain', '')
    
    # Update Cloud Database Trust Scores ---
    if db is not None and domain:
        try:
            is_clickbait_actual = is_clickbait if user_agrees else not is_clickbait
            flags_to_add = 1 if is_clickbait_actual else 0
            db.domains.update_one(
                {"domain": domain},
                {"$inc": {"flags": flags_to_add, "total_scans": 1}},
                upsert=True
            )
        except Exception as e:
            print("MongoDB update error:", e)
    
    file_exists = os.path.isfile('feedback.csv')
    try:
        row_count = 0
        with open('feedback.csv', mode='a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(['Headline', 'Model_Predicted_Clickbait', 'User_Agrees'])
            writer.writerow([headline, is_clickbait, user_agrees])
            
        # --- FEATURE 1: Automated Retraining Pipeline (MLOps) ---
        with open('feedback.csv', mode='r', encoding='utf-8') as f:
            row_count = sum(1 for row in f) - 1 # Exclude header
            
        if row_count > 0 and row_count % 10 == 0:
            print(f"Collected {row_count} feedback entries. Triggering Automated MLOps Retraining...")
            def retrain_model():
                global svm_model, svm_vectorizer
                try:
                    subprocess.run(['python', 'train_model.py'], check=True)
                    svm_model = joblib.load('clickbait_model.pkl')
                    svm_vectorizer = joblib.load('vectorizer.pkl')
                    print("MLOps Pipeline: Model retrained and successfully hot-reloaded!")
                except Exception as e:
                    print("MLOps Retraining Error:", e)
                    
            threading.Thread(target=retrain_model).start()

        return jsonify({"message": "Feedback saved!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, port=5000)