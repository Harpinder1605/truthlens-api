👁️🛡️ TruthLens AI

TruthLens AI is a robust, real-time Chrome Extension designed to detect clickbait, misleading headlines, and fake news. Built as a comprehensive Full-Stack Machine Learning project, it bridges a Manifest V3 browser extension with a Flask-powered AI backend to analyze context, verify claims, and protect user privacy.

🌟 Key Features

🧠 Machine Learning Deception Detection: Utilizes a pre-trained Support Vector Machine (SVM) and TF-IDF Cosine Similarity to compare an article's headline against its body text, catching sensationalized or disconnected claims.

🎥 YouTube Video Analysis: Bypasses frontend scraping limitations by directly extracting video IDs and querying the youtube-transcript-api on the backend to run ML analysis on spoken video subtitles. (Note: YouTube aggressively blocks datacenter IPs. This feature works perfectly on local servers but may be blocked when deployed to cloud services like Render).

🚨 Google Fact-Check Integration: Automatically cross-references headlines with the Google Fact Check Explorer API to immediately flag debunked claims from sources like Snopes, Reuters, and PolitiFact.

✍️ In-Page Trigger Highlighting: Dynamically injects a DOM TreeWalker script to highlight sensational "trigger words" directly on the webpage in a Grammarly-style format.

📊 Domain Reputation Scoring: Uses Chrome's local storage to build a historical "Trust Score" for websites based on your browsing history and previous AI verdicts.

🛡️ Active Privacy Shield: Implements Chrome's declarativeNetRequest API to silently block known tracking domains and analytics scripts, reporting blocked counts directly to the premium UI.

🔄 Active Learning Feedback Loop: Features a crowdsourced "Yes/No" feedback mechanism that writes user corrections to a backend CSV, creating a pipeline for continuous model retraining.

🛠️ Tech Stack

Frontend (Chrome Extension):

HTML5 / CSS3 (Premium Metallic/Golden UI Design)

JavaScript (ES6+)

Chrome Extensions API (Manifest V3, declarativeNetRequest, scripting, storage)

Backend (AI Server):

Python 3

Flask & Flask-CORS (REST API)

Scikit-Learn & Joblib (SVM Model & Vectorizer)

gunicorn (Production WSGI Server)

youtube-transcript-api (Video subtitle extraction)

requests (Google Fact Check API communication)

🚀 Installation & Setup

Because TruthLens relies on both a browser extension and an AI processing server, you need to set up both environments.

1. Backend Setup (Local Development)

Navigate to the backend directory:

cd truthlens-api


Create and activate a Python virtual environment:

python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate


Install the required Python dependencies:

pip install flask flask-cors scikit-learn joblib youtube-transcript-api requests gunicorn


Start the local development server:

python app.py


The server should now be running on http://127.0.0.1:5000.

2. Production Deployment (Render)

When deploying your Flask app to Render as a Web Service, use the following configuration to ensure the server processes ML requests smoothly without premature timeouts:

Build Command: pip install -r requirements.txt

Start Command: gunicorn app:app --timeout 180

(Note: The --timeout 180 flag ensures the server doesn't drop connections for up to 180 seconds, allowing enough time for large transcript extractions and deep AI analysis).

⚠️ Important Note on YouTube Analysis: Because YouTube actively blocks requests originating from cloud provider IPs (Render, AWS, Google Cloud, etc.), the YouTube Video Analysis feature will likely fail in a production environment. To test the YouTube transcript extraction, please run the backend server locally.

3. Frontend Setup (Chrome Extension)

Open Google Chrome and navigate to chrome://extensions/.

Turn on Developer mode (toggle switch in the top right corner).

Click the Load unpacked button.

Select the folder containing your extension files (manifest.json, popup.html, popup.js, etc.).

Pin the TruthLens golden icon to your toolbar for easy access!

4. Server Health Check

Verify that your server is running properly by checking these links:

Local: http://127.0.0.1:5000/

Production (Render): https://truthlens-api-str5.onrender.com/

📖 How to Use

Navigate to any news article, blog post, or YouTube video.

Click the TruthLens icon in your Chrome toolbar.

Toggle the Privacy Shield to instantly block trackers on the page.

Click Analyze Current Page to initiate the AI scan.

Review the Golden Result Card for:

Deception Probability & Similarity Scores

Domain Trust Rating

Trigger Words (Check the webpage itself for highlights!)

Debunk alerts (if the claim was fact-checked by Google).

Click Yes or No at the bottom to help retrain the model.

📁 Architecture Overview

manifest.json: The core configuration file requesting necessary permissions (ActiveTab, Storage, DNR).

popup.js: Handles the UI logic, DOM scraping injection, and HTTP requests to the backend.

background.js: A service worker that listens for blocked tracker events and passes statistics to the popup.

app.py: The Flask REST API that receives scraped text/video IDs, fetches transcripts, queries Google Fact Check, and processes the Machine Learning pipelines.

clickbait_model.pkl / vectorizer.pkl: The exported Scikit-Learn brain of the application.

Created as a Full-Stack AI Graduation Project.