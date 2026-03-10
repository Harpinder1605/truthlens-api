from flask import Flask, request, jsonify
from flask_cors import CORS
from sklearn.metrics.pairwise import cosine_similarity
import joblib
import math

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
    
    word_count = len(body.split())

    # --- EDGE CASE: Video/Media Content with low text ---
    if word_count < 10:
        if has_media:
            return jsonify({
                "headline": headline,
                "svm_flag": False,
                "similarity_score": 0,
                "final_warning": False,
                "message": "Media Content: Not enough text to verify.",
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
    
    risk_percentage = int(((svm_prob * 0.6) + ((1 - sim_score) * 0.4)) * 100)
    risk_percentage = max(0, min(100, risk_percentage))

    # --- FEATURE 2: Read Time & Content Depth ---
    read_time = max(1, round(word_count / 250))

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

    # NEW LOGIC: Handling YouTube and Media Noise
    # If it has a video, and the word count is under 350 words, AND the similarity is near zero...
    # It means we scraped sidebar noise (like YouTube comments) instead of an actual article.
    if has_media and (word_count < 50 or (word_count < 350 and sim_score < 0.15)):
        is_media_flag = True
        final_warning = False
        verdict_msg = "Media Content: Context is inside the video."
        risk_percentage = 0
        sim_score = 0
        
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
        "is_media": is_media_flag
    }

    return jsonify(response)

if __name__ == '__main__':
    app.run(debug=True, port=5000)