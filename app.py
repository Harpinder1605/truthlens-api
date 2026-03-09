from flask import Flask, request, jsonify
from flask_cors import CORS
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import joblib

app = Flask(__name__)
# Enable CORS so the Chrome extension can communicate with this API
CORS(app)

print("Loading AI Models...")
try:
    svm_model = joblib.load('clickbait_model.pkl')
    svm_vectorizer = joblib.load('vectorizer.pkl')
    print("Models loaded successfully!")
except Exception as e:
    print(f"Error loading models: {e}. Did you run train_model.py?")

@app.route('/', methods=['GET'])
def home():
    return "TruthLens AI Server is running!"

@app.route('/api/analyze', methods=['POST'])
def analyze_article():
    data = request.json
    headline = data.get('headline', '')
    body = data.get('body', '')

    if not headline or not body:
        return jsonify({"error": "Please provide both headline and body text."}), 400

    # --- 1. THE "FRESH ANGLE" (Cosine Similarity) ---
    # We use a temporary vectorizer just for comparing these two pieces of text
    temp_vectorizer = TfidfVectorizer(stop_words='english')
    try:
        tfidf_matrix = temp_vectorizer.fit_transform([headline, body])
        similarity_score = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
    except ValueError:
        # Happens if text is too short/empty after removing stop words
        similarity_score = 0.0 

    # --- 2. THE "CLASSIC ANGLE" (SVM Classification) ---
    # Convert headline using our trained vocabulary
    headline_vector = svm_vectorizer.transform([headline])
    svm_prediction = svm_model.predict(headline_vector)[0]
    
    # Force native Python int then bool to prevent JSON serialization errors
    is_clickbait_svm = bool(int(svm_prediction) == 1)
    sim_score = float(similarity_score)

    # --- 3. SMART COMBINED VERDICT ---
    if is_clickbait_svm and sim_score >= 0.25:
        # Scenario A: Headline sounds like clickbait, BUT the body actually backs it up! 
        # (It's sensational, but it is telling the truth).
        final_warning = False
        verdict_msg = "Sensational, but verifiable."
        
    elif is_clickbait_svm and sim_score < 0.25:
        # Scenario B: Sounds like clickbait AND the body doesn't back it up.
        final_warning = True
        verdict_msg = "High Risk: Clickbait!"
        
    elif not is_clickbait_svm and sim_score < 0.10:
        # Scenario C: Normal headline, but the body is completely unrelated.
        final_warning = True
        verdict_msg = "High Risk: Misleading Content!"
        
    else:
        # Scenario D: Normal headline, decent similarity.
        final_warning = False
        verdict_msg = "Seems Reliable."

    response = {
        "headline": headline,
        "svm_flag": is_clickbait_svm,
        "similarity_score": round(sim_score, 2),
        "final_warning": final_warning,
        "message": verdict_msg
    }

    return jsonify(response)

if __name__ == '__main__':
    # Run the server on port 5000
    app.run(debug=True, port=5000)