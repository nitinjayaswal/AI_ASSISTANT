/**
 * College AI Assistant - Authentication Module
 * Manages admin authentication state, login, logout, and page route protection.
 */

class CollegeAuth {
  constructor() {
    this.storageKey = "college_admin_session";
    this.currentUser = this.getStoredUser();
  }

  getStoredUser() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  isAuthenticated() {
    return !!this.currentUser;
  }

  async login(email, password) {
    // 1. Attempt Firebase Auth if configured
    if (window.FirebaseBridge && window.FirebaseBridge.auth && window.FirebaseBridge.isConfigured()) {
      try {
        const userCredential = await window.FirebaseBridge.auth.signInWithEmailAndPassword(email, password);
        const user = {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          role: "admin",
          loginTime: new Date().toISOString()
        };
        this.saveUser(user);
        return { success: true, user };
      } catch (err) {
        console.warn("[Auth] Firebase auth failed, attempting local credentials verification:", err.message);
      }
    }

    // 2. Local / Mock Admin Verification
    // Admin password set to Uiet@123 as requested
    const validCredentials = (
      (email === "admin@college.edu" && password === "Uiet@123") ||
      (email === "registrar@college.edu" && password === "Uiet@123") ||
      (email === "admin@uiet.ac.in" && password === "Uiet@123") ||
      (email.endsWith("@college.edu") && password === "Uiet@123") ||
      (email.endsWith("@uiet.ac.in") && password === "Uiet@123") ||
      (email === "demo" && (password === "demo" || password === "Uiet@123"))
    );

    if (validCredentials) {
      const user = {
        uid: "admin-" + Math.random().toString(36).substring(2, 9),
        email: email === "demo" ? "admin@college.edu" : email,
        role: "admin",
        loginTime: new Date().toISOString()
      };
      this.saveUser(user);
      return { success: true, user };
    } else {
      throw new Error("Invalid admin credentials. Use admin@college.edu and password Uiet@123");
    }
  }

  logout() {
    if (window.FirebaseBridge && window.FirebaseBridge.auth && window.FirebaseBridge.isConfigured()) {
      window.FirebaseBridge.auth.signOut().catch(console.error);
    }
    localStorage.removeItem(this.storageKey);
    this.currentUser = null;
    window.location.href = "login.html";
  }

  saveUser(user) {
    this.currentUser = user;
    localStorage.setItem(this.storageKey, JSON.stringify(user));
  }

  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = "login.html";
    }
  }

  redirectIfAuthenticated() {
    if (this.isAuthenticated()) {
      window.location.href = "admin.html";
    }
  }
}

window.CollegeAuth = new CollegeAuth();
