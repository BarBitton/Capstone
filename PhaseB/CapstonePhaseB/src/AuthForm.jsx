import { useState } from "react";
import { auth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";

export default function AuthForm({ onAuthSuccess }) {
  const [mode, setMode] = useState("login"); // 'login' or 'register'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      let userCredential;
      if (mode === "register") {
        userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
      } else {
        userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );
      }

      if (onAuthSuccess) {
        onAuthSuccess(userCredential.user);
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

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

        {error && <div className="error-box">{error}</div>}

        <button type="submit" className="primary-btn">
          {mode === "register" ? "Register" : "Login"}
        </button>
      </form>

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
