import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import joblib

print("Step 1: Loading Dataset from CSV...")
try:
    # Make sure your CSV file is named exactly this, and is in the same folder
    df = pd.read_csv('clickbait_data.csv')
    
    # NOTE: You may need to change 'headline' and 'label' below to match 
    # the exact column names in your specific Kaggle CSV file!
    text_column = 'headline' 
    label_column = 'clickbait'    # sometimes this is called 'clickbait' or 'class'

    # Drop any empty rows just in case
    df = df.dropna(subset=[text_column, label_column])
    
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

# This report is GOLD for your project documentation/presentation
print("Detailed Classification Report:")
print(classification_report(y_test, predictions, target_names=['Normal News', 'Clickbait']))

print("\nStep 6: Saving Production Models...")
joblib.dump(model, 'clickbait_model.pkl')
joblib.dump(vectorizer, 'vectorizer.pkl')

print("Success! The new, smarter 'clickbait_model.pkl' and 'vectorizer.pkl' have been saved.")