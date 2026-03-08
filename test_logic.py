from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

def check_consistency(headline, body_text):
    print(f"Analyzing Headline: '{headline}'")
    
    # 1. Initialize the TF-IDF Vectorizer (Turns text into math/numbers)
    # stop_words='english' automatically removes words like 'the', 'is', 'in'
    vectorizer = TfidfVectorizer(stop_words='english')
    
    # 2. Fit and transform the texts into vectors
    # We put them in a list so the vectorizer learns the vocabulary of both
    tfidf_matrix = vectorizer.fit_transform([headline, body_text])
    
    # 3. Calculate Cosine Similarity
    # tfidf_matrix[0] is the headline, tfidf_matrix[1] is the body
    similarity = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])
    score = similarity[0][0]
    
    print(f"Consistency Score: {score:.2f} (0 to 1.0)")
    
    if score < 0.15:
        print("Verdict: HIGH RISK! Headline does not match body (Clickbait/Misleading)\n")
    else:
        print("Verdict: SAFE. Headline matches content.\n")

# --- Let's test it with dummy data ---

# Test 1: Reliable News
good_headline = "NASA Launches New Rover to Mars"
good_body = "NASA has successfully launched its newest rover to Mars today. The spacecraft will explore the Martian surface for signs of ancient life and collect rock samples."
check_consistency(good_headline, good_body)

# Test 2: Clickbait/Misleading News
bad_headline = "You Won't Believe What Doctors Found In This Man's Stomach!"
bad_body = "The local sports team won their championship game last night in a stunning victory against their rivals. The crowd went wild as the final whistle blew."
check_consistency(bad_headline, bad_body)