// src/WelcomeScreen.jsx
import React from "react";

/**
 * WelcomeScreen.jsx (short documentation)
 * --------------------------------------
 * First screen shown when the user is not logged in.
 *
 * Purpose:
 * - Entry point of the application
 * - Allows navigation to:
 *   - Account registration
 *   - User login
 *
 * Behavior:
 * - Does not use Firebase directly
 * - Only triggers navigation callbacks
 *
 * Navigation:
 * - onCreateAccount → opens RegisterScreen
 * - onSignIn → opens LoginScreen
 */

const WelcomeScreen = ({ onCreateAccount, onSignIn }) => {
  return (
    <div className="screen">
      <h2 className="screen-title">WELCOME!</h2>

      {/* Main actions */}
      <div className="screen-buttons">
        <button className="btn-primary" onClick={onCreateAccount}>
          Create new account
        </button>

        <button className="btn-primary" onClick={onSignIn}>
          Sign in
        </button>
      </div>

      {/* Decorative icon */}
      <div className="doctor-figure">👨‍⚕️</div>
    </div>
  );
};

export default WelcomeScreen;
