import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";

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

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [screen, setScreen] = useState("welcome");
  const [selectedChildId, setSelectedChildId] = useState(null);

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
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setScreen("welcome");
  };

  let content = null;

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
  } else {
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
    } else if (screen === "diagnostic") {
      content = (
        <AssessmentScreen
          onBack={() => setScreen("home")}
          onGoChat={(childId) => {
            setSelectedChildId(childId);
            setScreen("chat");
          }}
        />
      );
    } else if (screen === "history") {
      content = (
        <HistoryScreen
          onBack={() => setScreen("home")}
          onOpenChild={(childId) => {
            setSelectedChildId(childId);
            setScreen("child");
          }}
        />
      );
    } else if (screen === "child") {
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
    } else if (screen === "chat") {
      content = (
        <ChatScreen
          childId={selectedChildId}
          onBack={() => setScreen("child")}
        />
      );
    } else if (screen === "info") {
      content = <InfoScreen onBack={() => setScreen("home")} />;
    }
  }

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
