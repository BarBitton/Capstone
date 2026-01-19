// src/HomeScreen.jsx
import React from "react";

const HomeScreen = ({
  userEmail,
  onStartDiagnostic,
  onViewHistory,
  onLearnAboutFTT,
  onLogout,
}) => {
  return (
    <div className="screen">
      <h2 className="screen-title">Hello!</h2>
      <p className="subtitle">Logged in as {userEmail}</p>

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

      <button className="btn-danger" onClick={onLogout}>
        Logout
      </button>

      <div className="doctor-figure">👨‍⚕️</div>
    </div>
  );
};

export default HomeScreen;
