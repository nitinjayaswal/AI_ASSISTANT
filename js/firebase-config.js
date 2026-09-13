/**
 * College AI Assistant - Firebase Configuration & Bridge
 * 
 * Provides unified access to Firebase Firestore, Storage, and Auth,
 * with seamless fallback to the local Express/Functions API.
 */

// Official Firebase Web Configuration
// In production, replace these values with your Firebase Project credentials
const firebaseConfig = {
  apiKey: "AIzaSyDemoCollegeApiKey1234567890",
  authDomain: "college-ai-assistant.firebaseapp.com",
  projectId: "college-ai-assistant",
  storageBucket: "college-ai-assistant.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};

class FirebaseBridge {
  constructor() {
    this.config = firebaseConfig;
    this.isInitialized = false;
    this.app = null;
    this.auth = null;
    this.db = null;
    this.storage = null;
    this.init();
  }

  init() {
    // Check if Firebase CDN SDKs are loaded in the window
    if (typeof window.firebase !== "undefined" && window.firebase.initializeApp) {
      try {
        if (!window.firebase.apps.length) {
          this.app = window.firebase.initializeApp(this.config);
        } else {
          this.app = window.firebase.app();
        }
        this.auth = window.firebase.auth ? window.firebase.auth() : null;
        this.db = window.firebase.firestore ? window.firebase.firestore() : null;
        this.storage = window.firebase.storage ? window.firebase.storage() : null;
        this.isInitialized = true;
        console.log("[Firebase] Client SDK initialized successfully.");
      } catch (err) {
        console.warn("[Firebase] Client initialization notice (using API fallback):", err.message);
      }
    } else {
      console.log("[Firebase] Running in API Mode. Backend endpoints emulate Firestore & Functions.");
    }
  }

  isConfigured() {
    return this.isInitialized && this.config.apiKey !== "AIzaSyDemoCollegeApiKey1234567890";
  }

  /**
   * Universal fetch helper to talk to backend endpoints
   */
  async callFunction(name, payload = {}, options = {}) {
    try {
      const response = await fetch(`/api/${name}`, {
        method: options.method || "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        },
        body: options.method === "GET" ? undefined : JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request to ${name} failed with status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[Functions Error] ${name}:`, error);
      throw error;
    }
  }
}

// Attach globally
window.FirebaseBridge = new FirebaseBridge();
