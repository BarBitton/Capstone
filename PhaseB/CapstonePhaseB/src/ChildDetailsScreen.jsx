import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "./firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  orderBy,
  query,
  limit,
} from "firebase/firestore";

import TrendChartWeight from "./TrendChartWeight";
import TrendChartHeight from "./TrendChartHeight";

/**
 * ChildDetailsScreen.jsx (short documentation)
 * -------------------------------------------
 * Shows details for one child:
 * - Child profile (age, gender, weight, height, symptoms, notes)
 * - Latest assessment text + CDC percentiles (if saved in the latest assessment)
 * - Trend charts (weight/height vs age) based on all saved assessments
 * - Button to open chat for this child
 *
 * Data sources (Firestore):
 * - users/{uid}/children/{childId}                 → child profile
 * - users/{uid}/children/{childId}/assessments     → assessment history + metrics
 */

function formatAge(ageMonths) {
  // Converts age in months to a simple readable string (e.g., "10 Months" or "2.03 Years")
  const m = Number(ageMonths);
  if (!Number.isFinite(m) || m < 0) return "";

  if (m < 12) return `${m} Months`;

  const years = Math.floor(m / 12);
  const months = m % 12;
  const mm = String(months).padStart(2, "0");
  return `${years}.${mm} Years`;
}

function fmtPercentile(p) {
  // Formats percentile value for display (e.g., 12.345 → "12.3th")
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  return `${n.toFixed(1)}th`;
}

function fmtZ(z) {
  // Formats z-score for display (standard deviation units)
  const n = Number(z);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

export default function ChildDetailsScreen({ childId, onBack, onOpenChat }) {
  // child → profile info, latest → newest assessment, assessments → all assessments for charts
  const [child, setChild] = useState(null);
  const [latest, setLatest] = useState(null);
  const [assessments, setAssessments] = useState([]);

  /**
   * Load data when childId changes:
   * 1) Child profile document
   * 2) Latest assessment (desc, limit 1)
   * 3) All assessments (asc) for trend charts
   */
  useEffect(() => {
    const run = async () => {
      const user = auth.currentUser;
      if (!user) return;

      // Child doc
      const childRef = doc(db, `users/${user.uid}/children/${childId}`);
      const childSnap = await getDoc(childRef);
      setChild(childSnap.exists() ? childSnap.data() : null);

      // Latest assessment
      const assRef = collection(
        db,
        `users/${user.uid}/children/${childId}/assessments`
      );
      const latestSnap = await getDocs(
        query(assRef, orderBy("createdAt", "desc"), limit(1))
      );
      if (!latestSnap.empty) setLatest(latestSnap.docs[0].data());
      else setLatest(null);

      // All assessments for trend charts
      const allSnap = await getDocs(query(assRef, orderBy("createdAt", "asc")));
      setAssessments(allSnap.docs.map((d) => d.data()));
    };

    run();
  }, [childId]);

  /**
   * Build chart points in the format needed by TrendChart components:
   * { ageMonths, weightKg, heightCm }
   * Notes:
   * - Supports both old/new field names (ageInMonths vs age).
   * - Deduplicates by ageMonths (keeps the last item for each age).
   */
  const points = useMemo(() => {
    const rows = (assessments || [])
      .map((a) => {
        const ageMonths = Number(
          a?.form?.ageInMonths ?? a?.form?.age ?? a?.ageInMonths ?? a?.age
        );
        const weightKg = Number(a?.form?.weight ?? a?.weight);
        const heightCm = Number(a?.form?.height ?? a?.height);

        return { ageMonths, weightKg, heightCm };
      })
      .filter(
        (p) =>
          Number.isFinite(p.ageMonths) &&
          (Number.isFinite(p.weightKg) || Number.isFinite(p.heightCm))
      );

    // Deduplicate by ageMonths (keep the last occurrence)
    const byAge = new Map();
    for (const r of rows) byAge.set(r.ageMonths, r);

    return Array.from(byAge.values()).sort((a, b) => a.ageMonths - b.ageMonths);
  }, [assessments]);

  // Simple loading state until we have the child profile
  if (!child) {
    return (
      <div className="screen">
        <button className="btn-secondary" onClick={onBack}>
          Back
        </button>
        <p>Loading...</p>
      </div>
    );
  }

  // Metrics are saved inside the latest assessment (if it exists)
  const metrics = latest?.metrics || null;
  const likelyFtt =
    typeof latest?.likelyFtt === "boolean" ? latest.likelyFtt : null;
  const likelyFttReasons = Array.isArray(latest?.likelyFttReasons)
    ? latest.likelyFttReasons
    : [];

  const wfaP = metrics?.weightForAge?.percentile;
  const wfaZ = metrics?.weightForAge?.z;
  const lfaP = metrics?.lengthForAge?.percentile;
  const lfaZ = metrics?.lengthForAge?.z;

  const hasAnyMetrics =
    Number.isFinite(Number(wfaP)) || Number.isFinite(Number(lfaP));

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <h2 className="screen-title">{child.childName}</h2>
      </div>

      {/* Child profile */}
      <div className="result-box">
        <h3>Child data</h3>

        <div>
          <b>Age:</b> {formatAge(child.age)}{" "}
          <span style={{ opacity: 0.7 }}>({child.age} months)</span>
        </div>

        <div>
          <b>Gender:</b> {child.gender}
        </div>
        <div>
          <b>Weight:</b> {child.weight} kg
        </div>
        <div>
          <b>Height:</b> {child.height} cm
        </div>
        <div>
          <b>Symptoms:</b> {child.symptoms || "-"}
        </div>
        <div>
          <b>Notes:</b> {child.notes || "-"}
        </div>
      </div>

      {/* Latest assessment + percentiles (if available) */}
      {latest && (
        <div className="result-box">
          <h3>Latest assessment</h3>
          <pre>{latest.assessmentResult}</pre>

          {hasAnyMetrics && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ margin: "8px 0" }}>Growth percentiles (CDC)</h4>

              <div style={{ lineHeight: 1.8 }}>
                <div>
                  <b>Weight-for-age:</b> {fmtPercentile(wfaP) || "N/A"}
                  {fmtZ(wfaZ) ? (
                    <span style={{ opacity: 0.8 }}> (z={fmtZ(wfaZ)})</span>
                  ) : null}
                </div>

                <div>
                  <b>Length-for-age:</b> {fmtPercentile(lfaP) || "N/A"}
                  {fmtZ(lfaZ) ? (
                    <span style={{ opacity: 0.8 }}> (z={fmtZ(lfaZ)})</span>
                  ) : null}
                </div>

                {likelyFtt !== null && (
                  <div style={{ marginTop: 8 }}>
                    <b>Likely FTT:</b>{" "}
                    <span style={{ fontWeight: 700 }}>
                      {likelyFtt ? "YES" : "NO"}
                    </span>
                  </div>
                )}

                {likelyFttReasons.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <b>Reasons:</b>
                    <ul style={{ margin: "6px 0 0 18px" }}>
                      {likelyFttReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trend charts */}
      <div className="result-box">
        <h3>Weight vs Age</h3>
        <TrendChartWeight
          points={points.filter((p) => Number.isFinite(p.weightKg))}
        />
      </div>

      <div className="result-box">
        <h3>Height vs Age</h3>
        <TrendChartHeight
          points={points.filter((p) => Number.isFinite(p.heightCm))}
        />
      </div>

      {/* Navigate to chat for this child */}
      <button className="btn-primary" onClick={() => onOpenChat(childId)}>
        Open Chat
      </button>
    </div>
  );
}
