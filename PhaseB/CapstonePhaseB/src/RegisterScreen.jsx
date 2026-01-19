// src/RegisterScreen.jsx
import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

const RegisterScreen = ({ onBack, onRegistered }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password || !repeatPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (password !== repeatPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
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

export default RegisterScreen;
