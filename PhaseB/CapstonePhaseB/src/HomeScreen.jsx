// src/HomeScreen.jsx
import React from "react";

/**
 * HomeScreen.jsx (short documentation)
 * -----------------------------------
 * This is the main menu screen shown after the user logs in.
 *
 * Purpose:
 * - Acts as the central navigation hub of the application.
 * - Allows the user to move to the main features:
 *     • Start a new diagnostic
 *     • View diagnostic history
 *     • Learn about Failure to Thrive (FTT)
 *     • Logout
 *
 * This component does not manage data or Firebase directly.
 * It only triggers navigation actions passed from App.jsx.
 */

const HomeScreen = ({
  userEmail,
  onStartDiagnostic,
  onViewHistory,
  onLearnAboutFTT,
  onLogout,
}) => {
  return (
    <div className="screen">
      {/* Greeting section */}
      <h2 className="screen-title">Hello!</h2>
      <p className="subtitle">Logged in as {userEmail}</p>

      {/* Main navigation buttons */}
      <div className="screen-buttons">
        <button className="btn-primary" onClick={onStartDiagnostic}>
          Start Diagnostic
        </button>

        <button className="btn-primary" onClick={onViewHistory}>
          View History
        </button>

        <button className="btn-primary" onClick={onLearnAboutFTT}>
          Learn About FTT
        </button>
      </div>

      {/* Logout button */}
      <button className="btn-danger" onClick={onLogout}>
        Logout
      </button>

      {/* Decorative UI element */}
      <div className="doctor-figure">👨‍⚕️</div>
    </div>
  );
};

export default HomeScreen;
