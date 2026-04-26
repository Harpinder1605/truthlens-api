import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import joblib
import os

print("Step 1: Loading Dataset from CSV...")
try:
    
    df = pd.read_csv('clickbait_data.csv')
    
    text_column = 'headline' 
    label_column = 'clickbait'    # sometimes this is called 'clickbait' or 'class'

    # Drop any empty rows just in case
    df = df.dropna(subset=[text_column, label_column])
    
    # FEATURE 1: Merge new crowdsourced data before training
    if os.path.exists('feedback.csv'):
        print("Merging crowdsourced feedback data for Continuous Learning...")
        feedback_df = pd.read_csv('feedback.csv')
        if not feedback_df.empty and 'Headline' in feedback_df.columns:
            # Calculate the true label based on user agreement
            def get_true_label(row):
                pred = str(row.get('Model_Predicted_Clickbait', '')).lower() == 'true'
                agrees = str(row.get('User_Agrees', '')).lower() == 'true'
                return 1 if pred == agrees else 0
            
            feedback_df[label_column] = feedback_df.apply(get_true_label, axis=1)
            feedback_df = feedback_df.rename(columns={'Headline': text_column})
            df = pd.concat([df, feedback_df[[text_column, label_column]]], ignore_index=True)
            print(f"Added {len(feedback_df)} new community-verified examples!")

    print(f"Successfully loaded {len(df)} headlines!")

except FileNotFoundError:
    print("ERROR: Could not find 'clickbait_data.csv'. Please download it and put it in this folder.")
    exit()
except KeyError as e:
    print(f"ERROR: Column not found. Please check your CSV column names. {e}")
    print(f"Available columns in your CSV: {df.columns.tolist()}")
    exit()

print("\nStep 2: Vectorizing Text...")
vectorizer = TfidfVectorizer(stop_words='english', lowercase=True, max_features=10000)
X = vectorizer.fit_transform(df[text_column])
y = df[label_column]

print("\nStep 3: Splitting data into Training and Testing sets...")
# We keep 20% of the data hidden from the AI so we can test it like an exam
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

print("\nStep 4: Training the SVM Model (This might take a few seconds)...")
model = LinearSVC()
model.fit(X_train, y_train)

print("\nStep 5: Evaluating Model Accuracy...")
predictions = model.predict(X_test)
accuracy = accuracy_score(y_test, predictions)
print(f"Accuracy: {accuracy * 100:.2f}%\n")

# This classification report gives us a deeper look at how well the model is doing on both classes (clickbait vs non-clickbait)
print("Detailed Classification Report:")
print(classification_report(y_test, predictions, target_names=['Normal News', 'Clickbait']))

print("\nStep 6: Saving Production Models...")
joblib.dump(model, 'clickbait_model.pkl')
joblib.dump(vectorizer, 'vectorizer.pkl')

print("Success! The new, smarter 'clickbait_model.pkl' and 'vectorizer.pkl' have been saved.")