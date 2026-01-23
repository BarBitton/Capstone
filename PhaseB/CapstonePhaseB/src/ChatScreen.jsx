import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "./firebase";
import { chatWithModel } from "./api";
import { addChatMessage } from "./db";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

/**
 * ChatScreen.jsx
 * --------------
 * This screen provides a chat UI for a specific child.
 *
 * Main idea:
 * - The chat is stored in Firestore under:
 *     users/{uid}/children/{childId}/chat
 *
 * - Messages are shown in real-time using Firestore onSnapshot().
 * - When the user sends a message:
 *    1) We save the user message to Firestore.
 *    2) We call chatWithModel(...) which sends the message to the backend.
 *       The backend builds context (child info + latest assessments + recent chat)
 *       and then calls the AI model.
 *    3) We save the AI response back to Firestore as an "assistant" message.
 *
 * Why store chat in Firestore?
 * - Keeps chat history persistent (even after refresh).
 * - Enables real-time sync between UI and database.
 * - Allows using the last messages as context for the AI model.
 */

export default function ChatScreen({ childId, onBack }) {
  /**
   * items:
   * Holds all chat messages to display in the UI.
   * Each item typically contains:
   * - id (Firestore document ID)
   * - role ("user" or "assistant")
   * - text (message content)
   * - createdAt (timestamp)
   */
  const [items, setItems] = useState([]);

  /**
   * msg:
   * Current text typed in the input box (not yet sent).
   */
  const [msg, setMsg] = useState("");

  /**
   * sending:
   * Used to disable the Send button while waiting for the AI response.
   * Prevents sending multiple requests at the same time.
   */
  const [sending, setSending] = useState(false);

  /**
   * user:
   * The currently logged-in Firebase user.
   * Needed to build the Firestore path and to authorize API calls.
   */
  const user = auth.currentUser;

  /**
   * chatCol:
   * A memoized Firestore reference to the chat collection of the selected child.
   *
   * We use useMemo so we don't recreate the collection reference on every render.
   * If user or childId is missing → chatCol becomes null.
   */
  const chatCol = useMemo(() => {
    if (!user || !childId) return null;
    return collection(db, `users/${user.uid}/children/${childId}/chat`);
  }, [user, childId]);

  /**
   * Real-time listener for chat messages
   * -----------------------------------
   * - Runs whenever chatCol changes (child changed or user changed).
   * - Orders messages by createdAt ascending (oldest → newest).
   * - Updates UI instantly when new messages are added.
   */
  useEffect(() => {
    if (!chatCol) return;

    const q = query(chatCol, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // Cleanup the Firestore listener when leaving the screen / changing child
    return () => unsub();
  }, [chatCol]);

  /**
   * send()
   * ------
   * Sends the current message to the chat.
   *
   * Steps:
   * 1) Validate input (must not be empty)
   * 2) Save the user message to Firestore
   * 3) Call backend via chatWithModel(...) to get AI response
   * 4) Save the AI response to Firestore
   *
   * Error handling:
   * - If something fails, we log the error and save a friendly error message
   *   in the chat so the UI still shows feedback.
   */
  const send = async () => {
    if (!msg.trim()) return;
    if (!user) return;

    const text = msg.trim();
    setMsg("");
    setSending(true);

    try {
      // 1) Save the user message
      await addChatMessage(user.uid, childId, "user", text);

      // 2) Ask the AI model (backend builds the context)
      const ai = await chatWithModel({ uid: user.uid, childId, message: text });

      // 3) Save the assistant message
      await addChatMessage(user.uid, childId, "assistant", ai);
    } catch (e) {
      console.error(e);

      // If AI call fails, still write a message so the user sees feedback
      await addChatMessage(
        user.uid,
        childId,
        "assistant",
        "Sorry, something went wrong. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  /**
   * UI structure
   * ------------
   * - Header with back button
   * - Scrollable message area (chat bubbles)
   * - Input + Send button
   *
   * The UI aligns:
   * - user messages to the right (dark bubble)
   * - assistant messages to the left (light bubble)
   */
  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <h2 className="screen-title">Chat</h2>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          border: "1px solid #ddd",
          padding: 10,
          borderRadius: 8,
        }}
      >
        {items.map((m) => (
          <div
            key={m.id}
            style={{
              marginBottom: 10,
              textAlign: m.role === "user" ? "right" : "left",
            }}
          >
            <div
              style={{
                display: "inline-block",
                padding: "8px 10px",
                borderRadius: 12,
                maxWidth: "85%",
                background: m.role === "user" ? "#000" : "#f3f4f6",
                color: m.role === "user" ? "#fff" : "#111",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          className="form-input"
          placeholder="Type a message..."
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          // Allows pressing Enter to send a message quickly
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn-primary" onClick={send} disabled={sending}>
          {sending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
