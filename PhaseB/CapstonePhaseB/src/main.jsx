import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

/**
 * main.jsx
 * --------
 * Entry point of the React application.
 *
 * Responsibilities:
 * - Finds the root HTML element ("root")
 * - Creates the React application root
 * - Renders the App component
 *
 * Notes:
 * - React.StrictMode is used only in development.
 *   It helps detect potential problems but does not affect production behavior.
 * - App.jsx contains the main application logic and navigation.
 */

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
