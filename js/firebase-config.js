/**
 * College AI Assistant - Firebase Configuration & Bridge
 * 
 * Provides unified access to Firebase Firestore, Storage, and Auth,
 * with seamless fallback to the local Express/Functions API.
 */

// Official Firebase Web Configuration provisioned for this project
const firebaseConfig = {
  projectId: "gen-lang-client-0950963299",
  appId: "1:501133462431:web:bef497b242a10a64ec8baa",
  apiKey: "AIzaSyDPh5A12NupPQh533Wiguaif1ShaQE7WA4",
  authDomain: "gen-lang-client-0950963299.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-collegeaiassista-3b073e3e-0862-4f78-a6c0-e7bebff9c153",
  storageBucket: "gen-lang-client-0950963299.firebasestorage.app",
  messagingSenderId: "501133462431",
  oAuthClientId: "501133462431-a674v3qj6i1d2o95bj18bejsemr9t569.apps.googleusercontent.com"
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

  async init() {
    // Check if Firebase CDN SDKs are loaded in the window
    if (typeof window.firebase !== "undefined" && window.firebase.initializeApp) {
      try {
        if (!window.firebase.apps.length) {
          this.app = window.firebase.initializeApp(this.config);
        } else {
          this.app = window.firebase.app();
        }
        this.auth = window.firebase.auth ? window.firebase.auth() : null;
        if (window.firebase.firestore) {
          try {
            this.db = this.config.firestoreDatabaseId 
              ? window.firebase.app().firestore(this.config.firestoreDatabaseId)
              : window.firebase.firestore();
          } catch (e) {
            this.db = window.firebase.firestore();
          }
        } else {
          this.db = null;
        }
        this.storage = window.firebase.storage ? window.firebase.storage() : null;
        this.isInitialized = true;
        console.log("[Firebase] Client SDK initialized with Project:", this.config.projectId, "and Database:", this.config.firestoreDatabaseId);
      } catch (err) {
        console.warn("[Firebase] Client initialization notice (using API fallback):", err.message);
      }
    } else {
      console.log("[Firebase] Running with full-stack Cloud Run + Firestore backend.");
    }
  }

  isConfigured() {
    return Boolean(this.config && this.config.apiKey && this.config.projectId);
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
