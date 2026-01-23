// src/RegisterScreen.jsx
import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

/**
 * RegisterScreen.jsx (short documentation)
 * ---------------------------------------
 * Screen used for creating a new user account.
 *
 * Purpose:
 * - Allows new users to register using email and password
 * - Uses Firebase Authentication
 *
 * Behavior:
 * - Validates that all fields are filled
 * - Ensures both password fields match
 * - Creates a new Firebase user
 * - Notifies App.jsx when registration succeeds
 */

const RegisterScreen = ({ onBack, onRegistered }) => {
  // User input states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  // Error message shown to the user
  const [error, setError] = useState("");

  /**
   * handleRegister
   * --------------
   * Handles the registration form submission.
   */
  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    // Basic client-side validation
    if (!email || !password || !repeatPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (password !== repeatPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      // Firebase account creation
      await createUserWithEmailAndPassword(auth, email, password);

      // Notify parent component (App.jsx)
      onRegistered();
    } catch (err) {
      setError(err.message || "Registration failed.");
    }
  };

  return (
    <div className="screen">
      <h2 className="screen-title">Create an account</h2>

      <form className="form" onSubmit={handleRegister}>
        <label className="form-label">Enter your mail address:</label>
        <input
          type="email"
          className="form-input"
          placeholder="email@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="form-label">Enter password:</label>
        <input
          type="password"
          className="form-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <label className="form-label">Repeat password:</label>
        <input
          type="password"
          className="form-input"
          value={repeatPassword}
          onChange={(e) => setRepeatPassword(e.target.value)}
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

export default RegisterScreen;
