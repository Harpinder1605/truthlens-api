🔍 TruthLens AI

TruthLens AI is a full-stack Machine Learning browser extension designed to detect clickbait and misleading headlines in real-time. It uses Natural Language Processing (NLP) to mathematically compare a webpage's headline to its actual body content, protecting users from "false promise" journalism.

🚀 Features

Real-Time DOM Scraping: Intelligently extracts headers and article body text while ignoring ads and navigation bars.

Support Vector Machine (SVM): Trained on 32,000+ real-world articles to recognize historical clickbait patterns with ~95% accuracy.

Contextual NLP Verification: Calculates the Cosine Similarity between the headline and the body text. If the body doesn't deliver on the headline's promise, the extension flags it.

Cloud API Backend: Powered by a Python/Flask server hosted on Render, allowing instant asynchronous analysis without lagging the browser.

🛠️ Technology Stack

Frontend: HTML, CSS (Premium UI), JavaScript (Chrome Manifest V3)

Backend: Python, Flask, Gunicorn

Machine Learning: Scikit-Learn (LinearSVC, TF-IDF, Cosine Similarity), Pandas

📥 How to Install the Extension (For Users)

You can install this extension directly into your Chrome browser in 30 seconds:

Click the green Code button at the top of this repository and select Download ZIP.

Extract the downloaded ZIP file on your computer.

Open Google Chrome and type chrome://extensions/ in the URL bar.

Turn on Developer mode (toggle switch in the top right corner).

Click the Load unpacked button in the top left.

Select the extension folder from the files you just extracted.

Click the TruthLens AI icon in your browser toolbar on any news article!

🧠 How to Train the Model (For Developers)

If you want to run the training algorithm locally:

Clone this repository.

Download the original dataset from Kaggle and place clickbait_data.csv in the root folder.

Install dependencies: pip install -r requirements.txt

Run the training script: python train_model.py
(Note: The pre-trained .pkl files are already included in this repo, so training is optional).
