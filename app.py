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
    print("Error loading models. Did you run train_model.py first?", e)

@app.route('/api/analyze', methods=['POST'])
def analyze():
    data = request.json
    if not data or 'headline' not in data or 'body' not in data:
        return jsonify({"error": "Missing data"}), 400
        
    headline = data['headline']
    body = data['body']
    
    if len(body.split()) < 10:
        return jsonify({"error": "Not enough text content found."}), 400

    # --- 1. Cosine Similarity ---
    tfidf_matrix = svm_vectorizer.transform([headline, body])
    sim_score = float(cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0])

    # --- 2. SVM Classification ---
    headline_vector = svm_vectorizer.transform([headline])
    svm_prediction = svm_model.predict(headline_vector)[0]
    is_clickbait_svm = bool(int(svm_prediction) == 1)

    # --- FEATURE 1: Risk Confidence Percentage ---
    # Calculate distance from the SVM hyperplane and convert to a probability (Sigmoid)
    distance = svm_model.decision_function(headline_vector)[0]
    svm_prob = 1 / (1 + math.exp(-distance))
    
    # Formula: 60% weight to the SVM, 40% weight to the lack of similarity
    risk_percentage = int(((svm_prob * 0.6) + ((1 - sim_score) * 0.4)) * 100)
    risk_percentage = max(0, min(100, risk_percentage)) # Keep between 0 and 100

    # --- FEATURE 2: Read Time & Content Depth ---
    word_count = len(body.split())
    read_time = max(1, round(word_count / 250)) # Average reading speed is 250 WPM

    # --- FEATURE 3: Explainable AI (Trigger Words) ---
    # Look inside the SVM's brain to find which words caused the high score
    headline_words = [ "".join(c for c in word if c.isalnum()) for word in headline.lower().split() ]
    trigger_words = []
    vocab = svm_vectorizer.vocabulary_
    coefs = svm_model.coef_[0]
    
    for word in headline_words:
        if word in vocab:
            idx = vocab[word]
            weight = coefs[idx]
            # If the model strongly associates this word with clickbait
            if weight > 0.4: 
                trigger_words.append(word)
                
    # Remove duplicates
    trigger_words = list(set(trigger_words))

    # --- Smart Verdict Logic ---
    if is_clickbait_svm and sim_score >= 0.25:
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

    # Send the massive new data package back to the extension
    response = {
        "headline": headline,
        "svm_flag": is_clickbait_svm,
        "similarity_score": round(sim_score, 2),
        "final_warning": final_warning,
        "message": verdict_msg,
        "risk_percentage": risk_percentage,
        "word_count": word_count,
        "read_time": read_time,
        "trigger_words": trigger_words
    }

    return jsonify(response)

if __name__ == '__main__':
    app.run(debug=True, port=5000)