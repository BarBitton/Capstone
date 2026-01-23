// src/LoginScreen.jsx
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

/**
 * LoginScreen.jsx (short documentation)
 * ------------------------------------
 * Screen used for signing in existing users.
 *
 * Purpose:
 * - Allows users to log in using email and password
 * - Uses Firebase Authentication
 *
 * Behavior:
 * - Validates that email and password are entered
 * - On successful login, notifies App.jsx via onLoggedIn()
 * - Displays error messages if authentication fails
 */

const LoginScreen = ({ onBack, onLoggedIn }) => {
  // User input states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Error message shown to the user
  const [error, setError] = useState("");

  /**
   * handleLogin
   * -----------
   * Handles the login form submission.
   */
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    // Simple client-side validation
    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }

    try {
      // Firebase email/password authentication
      await signInWithEmailAndPassword(auth, email, password);

      // Notify parent component (App.jsx)
      onLoggedIn();
    } catch (err) {
      setError(err.message || "Login failed.");
    }
  };

  return (
    <div className="screen">
      <h2 className="screen-title">Sign In</h2>

      <form className="form" onSubmit={handleLogin}>
        <label className="form-label">Email:</label>
        <input
          type="email"
          className="form-input"
          placeholder="email@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="form-label">Password:</label>
        <input
          type="password"
          className="form-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {/* Error message */}
        {error && <div className="error-text">{error}</div>}

        {/* Actions */}
        <button type="submit" className="btn-primary">
          Continue
        </button>

        <button type="button" className="btn-secondary" onClick={onBack}>
          Back
        </button>
      </form>

      {/* Decorative element */}
      <div className="doctor-figure">👨‍⚕️</div>
    </div>
  );
};

export default LoginScreen;
