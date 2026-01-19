import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

function formatAge(ageMonths) {
  const m = Number(ageMonths);
  if (!Number.isFinite(m) || m < 0) return "";

  if (m < 12) return `${m} Months`;

  const years = Math.floor(m / 12);
  const months = m % 12;
  const mm = String(months).padStart(2, "0");
  return `${years}.${mm} Years`;
}

export default function HistoryScreen({ onBack, onOpenChild }) {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true); // ✅ NEW

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const ref = collection(db, `users/${user.uid}/children`);
    const q = query(ref, orderBy("updatedAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setChildren(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false); // ✅ snapshot ראשון הגיע
      },
      (err) => {
        console.error("History snapshot error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  return (
    <div className="screen">
      <h2 className="screen-title">Diagnostic History</h2>

      {loading ? (
        <p>Loading history...</p>
      ) : children.length === 0 ? (
        <p>No children found yet.</p>
      ) : (
        <div className="history-list">
          {children.map((c) => (
            <button
              key={c.id}
              className="history-item"
              onClick={() => onOpenChild(c.id)}
            >
              <div className="history-main">
                <span className="history-title">{c.childName}</span>
              </div>

              <div className="history-snippet">
                {c.gender || ""}
                {Number.isFinite(Number(c.age)) ? ` • ${formatAge(c.age)}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <button className="btn-secondary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
