import { useState } from "react";
import { auth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";

/**
 * AuthForm.jsx
 * ------------
 * This component handles user authentication (login and registration).
 *
 * It provides a single form that can switch between:
 * - Login mode
 * - Register (create account) mode
 *
 * Authentication is performed using Firebase Authentication
 * with email and password.
 *
 * This component does NOT control navigation directly.
 * Instead, it notifies the parent component when authentication succeeds.
 */

export default function AuthForm({ onAuthSuccess }) {
  /**
   * mode:
   * Determines whether the form is in "login" or "register" mode.
   */
  const [mode, setMode] = useState("login"); // 'login' or 'register'

  /**
   * email:
   * Stores the user's email input.
   */
  const [email, setEmail] = useState("");

  /**
   * password:
   * Stores the user's password input.
   */
  const [password, setPassword] = useState("");

  /**
   * error:
   * Stores authentication error messages returned from Firebase.
   */
  const [error, setError] = useState("");

  /**
   * handleSubmit
   * ------------
   * Called when the authentication form is submitted.
   *
   * Flow:
   * 1. Prevent default form refresh.
   * 2. Clear previous error messages.
   * 3. Depending on mode:
   *    - register → create a new Firebase user
   *    - login    → sign in existing user
   * 4. If successful, notify the parent component.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      let userCredential;

      if (mode === "register") {
        // Create a new user account
        userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
      } else {
        // Login with existing account
        userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );
      }

      // Inform parent component that authentication succeeded
      if (onAuthSuccess) {
        onAuthSuccess(userCredential.user);
      }
    } catch (err) {
      // Display Firebase authentication errors to the user
      console.error(err);
      setError(err.message);
    }
  };

  /**
   * UI rendering
   * ------------
   * - Email + password form
   * - Error message (if exists)
   * - Button to switch between login and register modes
   */
  return (
    <div className="auth-container">
      <h1 className="app-title">Growth Assistant</h1>
      <h2>{mode === "register" ? "Create an account" : "Login"}</h2>

      <form onSubmit={handleSubmit} className="auth-form">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>

        {/* Display authentication error if exists */}
        {error && <div className="error-box">{error}</div>}

        <button type="submit" className="primary-btn">
          {mode === "register" ? "Register" : "Login"}
        </button>
      </form>

      {/* Toggle between login and register modes */}
      <div className="switch-mode">
        {mode === "register" ? (
          <p>
            Already have an account?{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => setMode("login")}
            >
              Login
            </button>
          </p>
        ) : (
          <p>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => setMode("register")}
            >
              Register
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
