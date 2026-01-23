import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";

/**
 * App.jsx
 * -------
 * This file is the main entry point of the frontend application.
 *
 * Responsibilities:
 * - Listen to Firebase Authentication state (login / logout)
 * - Control which screen is currently displayed
 * - Pass navigation callbacks between screens
 *
 * Important note:
 * This project does NOT use react-router.
 * Navigation is implemented manually using a "screen" state variable.
 * This approach is simpler and easier to understand for academic projects.
 */

import WelcomeScreen from "./WelcomeScreen";
import RegisterScreen from "./RegisterScreen";
import LoginScreen from "./LoginScreen";
import HomeScreen from "./HomeScreen";
import AssessmentScreen from "./AssessmentScreen";
import HistoryScreen from "./HistoryScreen";
import InfoScreen from "./InfoScreen";
import ChatScreen from "./ChatScreen";
import ChildDetailsScreen from "./ChildDetailsScreen";

import "./styles.css";

/**
 * App component
 * -------------
 * This component controls the global application flow.
 * It decides which screen to render based on:
 * - Whether the user is authenticated
 * - Which screen the user navigated to
 */
function App() {
  /**
   * currentUser:
   * Stores the logged-in Firebase user object.
   * If null → user is not authenticated.
   */
  const [currentUser, setCurrentUser] = useState(null);

  /**
   * screen:
   * Controls which UI screen is shown.
   * Possible values:
   * "welcome", "register", "login",
   * "home", "diagnostic", "history",
   * "child", "chat", "info"
   */
  const [screen, setScreen] = useState("welcome");

  /**
   * selectedChildId:
   * Stores the currently selected child ID.
   * Used when navigating between:
   * history → child details → chat
   */
  const [selectedChildId, setSelectedChildId] = useState(null);

  /**
   * Firebase authentication listener
   * --------------------------------
   * Runs once when the app loads.
   *
   * - If a user is logged in:
   *     → save user in state
   *     → redirect to home screen
   *
   * - If user logs out:
   *     → clear user
   *     → return to welcome screen
   */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setScreen("home");
      } else {
        setCurrentUser(null);
        setScreen("welcome");
      }
    });

    // Cleanup listener when component unmounts
    return () => unsub();
  }, []);

  /**
   * handleLogout
   * ------------
   * Signs the user out using Firebase Authentication
   * and redirects back to the welcome screen.
   */
  const handleLogout = async () => {
    await signOut(auth);
    setScreen("welcome");
  };

  /**
   * content:
   * Holds the currently rendered screen component.
   * This variable changes based on login state and navigation.
   */
  let content = null;

  /**
   * If the user is NOT logged in
   * ----------------------------
   * Only authentication-related screens are available.
   */
  if (!currentUser) {
    if (screen === "welcome") {
      content = (
        <WelcomeScreen
          onCreateAccount={() => setScreen("register")}
          onSignIn={() => setScreen("login")}
        />
      );
    } else if (screen === "register") {
      content = (
        <RegisterScreen
          onBack={() => setScreen("welcome")}
          onRegistered={() => setScreen("home")}
        />
      );
    } else if (screen === "login") {
      content = (
        <LoginScreen
          onBack={() => setScreen("welcome")}
          onLoggedIn={() => setScreen("home")}
        />
      );
    }
  }

  /**
   * If the user IS logged in
   * -----------------------
   * Full application features become available.
   */
  else {
    if (screen === "home") {
      content = (
        <HomeScreen
          userEmail={currentUser.email}
          onStartDiagnostic={() => setScreen("diagnostic")}
          onViewHistory={() => setScreen("history")}
          onLearnAboutFTT={() => setScreen("info")}
          onLogout={handleLogout}
        />
      );
    }

    // Assessment / diagnostic flow
    else if (screen === "diagnostic") {
      content = (
        <AssessmentScreen
          onBack={() => setScreen("home")}
          onGoChat={(childId) => {
            setSelectedChildId(childId);
            setScreen("chat");
          }}
        />
      );
    }

    // History list of children
    else if (screen === "history") {
      content = (
        <HistoryScreen
          onBack={() => setScreen("home")}
          onOpenChild={(childId) => {
            setSelectedChildId(childId);
            setScreen("child");
          }}
        />
      );
    }

    // Child details screen
    else if (screen === "child") {
      content = (
        <ChildDetailsScreen
          childId={selectedChildId}
          onBack={() => setScreen("history")}
          onOpenChat={(childId) => {
            setSelectedChildId(childId);
            setScreen("chat");
          }}
        />
      );
    }

    // Chat screen (AI follow-up)
    else if (screen === "chat") {
      content = (
        <ChatScreen
          childId={selectedChildId}
          onBack={() => setScreen("child")}
        />
      );
    }

    // Information / educational screen
    else if (screen === "info") {
      content = <InfoScreen onBack={() => setScreen("home")} />;
    }
  }

  /**
   * Main layout wrapper
   * -------------------
   * app-shell   → full page layout
   * app-phone   → phone-like container (UI design choice)
   * app-header  → application title
   * app-main    → active screen content
   */
  return (
    <div className="app-shell">
      <div className="app-phone">
        <header className="app-header">
          <h1 className="app-title">Growth Deficiency Diagnosis</h1>
        </header>
        <main className="app-main">{content}</main>
      </div>
    </div>
  );
}

export default App;
