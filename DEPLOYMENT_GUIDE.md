# College AI Assistant - Deployment Guide

This guide walks you through deploying the College AI Assistant web app with Firebase Hosting, Cloud Firestore, Cloud Storage, Firebase Cloud Functions, and Google Gemini API.

---

## Architecture Overview
- **Frontend**: HTML5, Modern CSS, Vanilla JavaScript (Zero framework bloat, instant loading).
- **Backend**: Firebase Cloud Functions (or Express on Cloud Run) for document parsing, Firestore persistence, and retrieval.
- **AI Grounding**: Gemini 2.5 Flash via `@google/genai` with strict grounding and zero-hallucination constraint.

---

## 1. Prerequisites
1. Node.js 18+ and npm installed.
2. A Firebase account ([firebase.google.com](https://firebase.google.com)).
3. A Google AI Studio API Key ([aistudio.google.com](https://aistudio.google.com)).
4. Firebase CLI installed:
   ```bash
   npm install -g firebase-tools
   ```

---

## 2. Firebase Project Setup
1. Log in to Firebase CLI:
   ```bash
   firebase login
   ```
2. Initialize Firebase in this project directory:
   ```bash
   firebase init
   ```
   Select:
   - **Firestore**: Configure security rules and indexes.
   - **Functions**: Configure Cloud Functions.
   - **Storage**: Configure security rules.
   - **Hosting**: Configure hosting and rewrites.

3. When prompted:
   - For Firestore rules: `firestore.rules`
   - For Storage rules: `storage.rules`
   - For Functions directory: `functions`
   - For Public directory: `.` (or build `dist` if using Vite build)

---

## 3. Configure Environment Variables
Set your Gemini API Key in Firebase Functions:

```bash
# Using Firebase Functions Secrets
firebase functions:secrets:set GEMINI_API_KEY
```

Or for local development, configure your `.env` file:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Update your Firebase Web configuration in `/js/firebase-config.js`:
```javascript
window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

---

## 4. Install Cloud Functions Dependencies
```bash
cd functions
npm install
cd ..
```

---

## 5. Deploying to Firebase

### Deploy Rules First (Firestore & Storage):
```bash
firebase deploy --only firestore:rules,storage:rules
```

### Deploy Cloud Functions:
```bash
firebase deploy --only functions
```

### Deploy Web App Frontend:
```bash
firebase deploy --only hosting
```

Or deploy all components in a single command:
```bash
firebase deploy
```

---

## 6. Local Testing with Firebase Emulators
You can test the entire stack locally using Firebase Emulators:
```bash
firebase emulators:start
```
Or run the integrated Express + Vite dev server directly:
```bash
npm run dev
```

---

## 7. Verifying Grounding & Citations
1. Open the Student Chatbot at `/chat.html`.
2. Try the prompt: *"How do I apply for a bonafide certificate?"*
   - Verify citation: `Bonafide_Certificate_Procedure.pdf`, Page 2, Confidence ~95%.
3. Try an out-of-scope question: *"Who won the 2022 World Cup?"*
   - Verify fallback: *"I could not find this information in the uploaded college documents."* (Confidence 0%, Source: N/A).
