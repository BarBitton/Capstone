// src/LoginScreen.jsx
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

const LoginScreen = ({ onBack, onLoggedIn }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
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

        {error && <div className="error-text">{error}</div>}

        <button type="submit" className="btn-primary">
          Continue
        </button>
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back
        </button>
      </form>
      <div className="doctor-figure">👨‍⚕️</div>
    </div>
  );
};

export default LoginScreen;
