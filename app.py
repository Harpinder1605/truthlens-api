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
    
    # FIX: Force native Python int then bool to prevent JSON serialization errors
    is_clickbait_svm = bool(int(svm_prediction) == 1)

    # --- 3. COMBINED VERDICT ---
    # FIX: Force native Python bool and float to prevent JSON serialization errors
    final_warning = bool(is_clickbait_svm or (float(similarity_score) < 0.15))

    response = {
        "headline": headline,
        "svm_flag": is_clickbait_svm,
        "similarity_score": round(float(similarity_score), 2),
        "final_warning": final_warning,
        "message": "High Risk Clickbait/Misleading!" if final_warning else "Seems Reliable."
    }

    return jsonify(response)

if __name__ == '__main__':
    # Run the server on port 5000
    app.run(debug=True, port=5000)