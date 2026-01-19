import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "./firebase";
import { chatWithModel } from "./api";
import { addChatMessage } from "./db";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

export default function ChatScreen({ childId, onBack }) {
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const user = auth.currentUser;

  const chatCol = useMemo(() => {
    if (!user || !childId) return null;
    return collection(db, `users/${user.uid}/children/${childId}/chat`);
  }, [user, childId]);

  useEffect(() => {
    if (!chatCol) return;
    const q = query(chatCol, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [chatCol]);

  const send = async () => {
    if (!msg.trim()) return;
    if (!user) return;

    const text = msg.trim();
    setMsg("");
    setSending(true);

    try {
      // 1) save user message
      await addChatMessage(user.uid, childId, "user", text);

      // 2) ask model (server builds context)
      const ai = await chatWithModel({ uid: user.uid, childId, message: text });

      // 3) save assistant message
      await addChatMessage(user.uid, childId, "assistant", ai);
    } catch (e) {
      console.error(e);
      await addChatMessage(user.uid, childId, "assistant", "Sorry, something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-button" onClick={onBack}>← Back</button>
        <h2 className="screen-title">Chat</h2>
      </div>

      <div style={{ flex: 1, overflowY: "auto", border: "1px solid #ddd", padding: 10, borderRadius: 8 }}>
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
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn-primary" onClick={send} disabled={sending}>
          {sending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
