// src/WelcomeScreen.jsx
import React from "react";

const WelcomeScreen = ({ onCreateAccount, onSignIn }) => {
  return (
    <div className="screen">
      <h2 className="screen-title">WELCOME!</h2>
      <div className="screen-buttons">
        <button className="btn-primary" onClick={onCreateAccount}>
          Create new account
        </button>
        <button className="btn-primary" onClick={onSignIn}>
          Sign in
        </button>
      </div>
      <div className="doctor-figure">👨‍⚕️</div>
    </div>
  );
};

export default WelcomeScreen;
