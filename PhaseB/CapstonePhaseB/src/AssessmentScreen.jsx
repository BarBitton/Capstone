import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "./firebase";
import { diagnoseChild, assessExistingChild } from "./api";
import { upsertChild, addAssessment, addChatMessage } from "./db";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import TrendChartWeight from "./TrendChartWeight";
import TrendChartHeight from "./TrendChartHeight";

/**
 * AssessmentScreen.jsx
 * -------------------
 * What this screen does:
 * 1) Lets the user select an existing child OR create a new child.
 * 2) Runs an "assessment" (AI text + growth analysis).
 *
 * Two flows:
 * - NEW child:
 *   - We build a prompt on the client and call diagnoseChild(prompt).
 *   - We save the assessment from the client.
 *
 * - EXISTING child:
 *   - We call assessExistingChild(...) which hits the server route /assessExisting.
 *   - The server computes CDC percentiles + Likely FTT (trend-aware) and saves an assessment.
 *   - We display:
 *       • AI assessment text
 *       • CDC percentiles (weight-for-age, length-for-age) + z-scores
 *       • Likely FTT + reasons
 *
 * Why your percentiles sometimes didn't appear:
 * - In some project setups, assessExistingChild() returns ONLY a string (result),
 *   or the deploy/emulator may still be running an older version of api.js/functions.
 *
 * Fix in this version:
 * - We support BOTH return shapes:
 *     a) resp is an object: { result, metrics, likelyFtt, likelyFttReasons }
 *     b) resp is a string: "This is NOT FTT."
 * - If percentiles are missing from the response, we fallback to Firestore:
 *   we fetch the latest saved assessment document and read metrics from it.
 */

/**
 * Prompt used for NEW child OR fallback (no percentiles).
 * For existing child, we call /assessExisting so the server computes percentiles.
 */
function buildPromptWithTrend({ form, childFromDb, previousAssessments }) {
  const childBlock = childFromDb
    ? `Child profile (stored):
- Name: ${childFromDb.childName || form.childName || "Unknown"}
- Age (months): ${childFromDb.age ?? ""}
- Gender: ${childFromDb.gender ?? ""}
- Weight (kg): ${childFromDb.weight ?? ""}
- Height (cm): ${childFromDb.height ?? ""}
- Symptoms: ${childFromDb.symptoms ?? ""}
- Notes: ${childFromDb.notes ?? ""}`
    : "Child profile (stored): Not available";

  const currentBlock = `New assessment input (current):
- Name: ${form.childName}
- Age: ${form.ageInMonths} months
- Gender: ${form.gender}
- Weight: ${form.weight} kg
- Height: ${form.height} cm
- Symptoms: ${form.symptoms || "Not specified"}
- Additional notes: ${form.notes || "None"}`;

  const prevBlock =
    previousAssessments && previousAssessments.length
      ? previousAssessments
          .map((a, idx) => {
            const createdAt =
              a.createdAt?.toDate?.() ? a.createdAt.toDate().toISOString() : "";
            const header = createdAt
              ? `Previous assessment ${idx + 1} (${createdAt}):`
              : `Previous assessment ${idx + 1}:`;
            return `${header}\n${a.assessmentResult || "(no text)"}`;
          })
          .join("\n\n")
      : "No previous assessments.";

  return `
You are a pediatric clinical assistant supporting parents and clinicians in evaluating child growth concerns.
Your tone should be calm, empathetic, and practical, like a healthcare professional speaking to a parent.
Do not mention that you are an AI.

IMPORTANT OUTPUT RULE:
- Do NOT include citation markers such as [1], [2], (1), or references to numbered sources.
- Do NOT include reference lists or brackets.
- If medical knowledge is used, refer to it generally using phrases like:
  "based on pediatric growth guidelines" or
  "according to standard pediatric clinical practice".

If evidence excerpts are provided below, use them ONLY to improve reasoning, but NEVER cite or reference them explicitly in the text.

Style guidelines:
- Write in clear, natural English.
- Use short paragraphs and simple language.
- Avoid unnecessary medical jargon; explain terms briefly if used.
- Be reassuring but honest.
- If there are red flags, state them clearly and explain why.

Nutrition & recipes (ONLY if relevant):
- If the main issue may involve low intake, picky eating, insufficient calories/protein, or feeding difficulties (and there are no urgent red flags), add a section titled:
  "Food ideas & simple recipes"
- Provide 3–5 practical, high-calorie, high-protein options appropriate for toddlers/young children.
- Each recipe must include:
  • Name
  • Ingredients (3–8 items)
  • Steps (2–5 short steps)
  • One sentence: why it helps (e.g., calorie-dense, iron, protein)
- Keep it realistic: common ingredients, no supplements, no extreme diets.
- If there are red flags or severe illness concern, do NOT provide recipes; instead prioritize medical evaluation.

Before providing recipes, explicitly decide:
"Nutrition recipes needed: YES/NO"
Only show recipes if YES.

Strict output rule:
- First decide: "Likely FTT (growth-based): YES/NO" based on growth metrics and trend.
- If Likely FTT (growth-based) = NO:
  Output ONLY these two lines and NOTHING else:
    1) Likely FTT (growth-based): NO
    2) Brief reason (only one sentence).
  - Do NOT provide recommendations, next steps, questions, or recipes.
- If Likely FTT (growth-based) = YES:
  - Follow the full response structure below (including recommendations; recipes only if intake-related and no red flags).

Important: Do NOT conclude "no FTT" based only on the current percentile. A significant downward percentile crossing over time (e.g., from ~50th to ~10th) can still indicate FTT risk.

Response structure:
1) One-sentence summary of the child's growth status.
2) Trend vs prior assessments: improving / worsening / stable (1 short paragraph).
3) Why this may be happening (2–4 brief bullet points).
4) Recommended next steps (3–5 practical actions).
5) If needed, ask up to two clarifying questions.
6) Nutrition recipes needed: YES/NO
7) If YES: Food ideas & simple recipes

${childBlock}

${currentBlock}

Previous assessments (most recent first):
${prevBlock}

Clinical task:
Based on the information above, assess the likelihood of Failure to Thrive and classify it as one of:
Normal growth / Mild FTT / Moderate FTT / Severe FTT / Refer for in-person evaluation.

Provide your assessment in English, following the response structure above.
`.trim();
}

/** Helper: formats percentile as "12.3th". */
function fmtPercentile(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  return `${n.toFixed(1)}th`;
}

/** Helper: formats z-score (standard deviation units). */
function fmtZ(z) {
  const n = Number(z);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

export default function AssessmentScreen({ onBack, onGoChat }) {
  // 1) Child selection & form data
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState("");

  const [form, setForm] = useState({
    childName: "",
    ageValue: "",
    ageUnit: "months",
    ageInMonths: "",
    gender: "",
    weight: "",
    height: "",
    symptoms: "",
    notes: "",
  });

  // 2) UI state
  const [loading, setLoading] = useState(false);
  const [assessment, setAssessment] = useState("");
  const [error, setError] = useState(null);

  // childId is used when user presses "Continue Chat"
  const [childId, setChildId] = useState(null);

  // 3) Percentiles + Likely FTT (for existing child)
  const [metrics, setMetrics] = useState(null);
  const [likelyFtt, setLikelyFtt] = useState(null);
  const [likelyFttReasons, setLikelyFttReasons] = useState([]);

  // 4) Trend charts state
  const [trendAssessments, setTrendAssessments] = useState([]);

  async function refreshTrendAssessments(childIdToLoad) {
    if (!childIdToLoad) {
      setTrendAssessments([]);
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    const assRef = collection(
      db,
      `users/${user.uid}/children/${childIdToLoad}/assessments`
    );

    const snap = await getDocs(query(assRef, orderBy("createdAt", "asc")));
    setTrendAssessments(snap.docs.map((d) => d.data()));
  }

  /**
   * Fetch the most recent assessment from Firestore and pull metrics from it.
   * This is a fallback in case the server response does not include metrics.
   */
  async function fetchLatestAssessmentMetrics(uid, childIdToLoad) {
    const assRef = collection(db, `users/${uid}/children/${childIdToLoad}/assessments`);
    const assSnap = await getDocs(query(assRef, orderBy("createdAt", "desc"), limit(1)));
    const latest = assSnap.docs[0]?.data?.() ? assSnap.docs[0].data() : null;

    if (latest) {
      setMetrics(latest.metrics || null);
      setLikelyFtt(typeof latest.likelyFtt === "boolean" ? latest.likelyFtt : null);
      setLikelyFttReasons(
        Array.isArray(latest.likelyFttReasons) ? latest.likelyFttReasons : []
      );
    }
  }

  // Build chart points for TrendChart* components: { ageMonths, weightKg, heightCm }
  const trendPoints = useMemo(() => {
    const rows = (trendAssessments || [])
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

    // Deduplicate by ageMonths (keep latest)
    const byAge = new Map();
    for (const r of rows) byAge.set(r.ageMonths, r);

    return Array.from(byAge.values()).sort((a, b) => a.ageMonths - b.ageMonths);
  }, [trendAssessments]);

  // Subscribe to children list
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const ref = collection(db, `users/${user.uid}/children`);
    const q = query(ref, orderBy("updatedAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      setChildren(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => unsub();
  }, []);

  // Selecting a child: prefill form + load trend charts + reset output
  const handleSelectChild = async (id) => {
    setSelectedChildId(id);

    setAssessment("");
    setError(null);
    setChildId(null);

    setMetrics(null);
    setLikelyFtt(null);
    setLikelyFttReasons([]);

    if (!id) {
      setForm({
        childName: "",
        ageValue: "",
        ageUnit: "months",
        ageInMonths: "",
        gender: "",
        weight: "",
        height: "",
        symptoms: "",
        notes: "",
      });
      setTrendAssessments([]);
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    const childRef = doc(db, `users/${user.uid}/children/${id}`);
    const snap = await getDoc(childRef);
    if (!snap.exists()) return;

    const c = snap.data();

    setForm((prev) => ({
      ...prev,
      childName: c.childName || "",
      ageValue: c.age ?? "",
      ageUnit: "months",
      ageInMonths: c.age ?? "",
      gender: c.gender || "",
      weight: c.weight ?? "",
      height: c.height ?? "",
      symptoms: c.symptoms || "",
      notes: c.notes || "",
    }));

    await refreshTrendAssessments(id);
  };

  // Update form fields + compute ageInMonths
  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => {
      const updated = { ...prev, [name]: value };

      if (name === "ageValue" || name === "ageUnit") {
        const numericAge = Number(name === "ageValue" ? value : prev.ageValue);
        const unit = name === "ageUnit" ? value : prev.ageUnit;

        if (!isNaN(numericAge)) {
          updated.ageInMonths = unit === "years" ? numericAge * 12 : numericAge;
        }
      }

      return updated;
    });
  };

  // Submit assessment (new vs existing)
  const handleSubmit = async (e) => {
    e.preventDefault();

    setError(null);
    setAssessment("");
    setLoading(true);

    setMetrics(null);
    setLikelyFtt(null);
    setLikelyFttReasons([]);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in");

      const isExisting = Boolean(selectedChildId);
      const activeChildId = isExisting
        ? selectedChildId
        : `${form.childName.trim().toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

      setChildId(activeChildId);

      // For NEW child: keep your trend prompt logic (previousAssessments from last 4)
      let childFromDb = null;
      let previousAssessments = [];

      if (isExisting) {
        const childRef = doc(db, `users/${user.uid}/children/${activeChildId}`);
        const childSnap = await getDoc(childRef);
        childFromDb = childSnap.exists() ? childSnap.data() : null;

        const assRef = collection(
          db,
          `users/${user.uid}/children/${activeChildId}/assessments`
        );
        const assSnap = await getDocs(
          query(assRef, orderBy("createdAt", "desc"), limit(4))
        );
        previousAssessments = assSnap.docs.map((d) => d.data());
      }

      // Upsert child (months only)
      await upsertChild(user.uid, activeChildId, {
        childName: form.childName,
        age: Number(form.ageInMonths),
        gender: form.gender,
        weight: Number(form.weight),
        height: Number(form.height),
        symptoms: form.symptoms,
        notes: form.notes,
      });

      let aiText = "";

      if (isExisting) {
        // EXISTING child: server should compute CDC percentiles + Likely FTT
        const resp = await assessExistingChild({
          uid: user.uid,
          childId: activeChildId,
          form: {
            ...form,
            ageInMonths: Number(form.ageInMonths),
            weight: Number(form.weight),
            height: Number(form.height),
          },
        });

        // --- Support BOTH return types (object or string) ---
        const isObj = resp && typeof resp === "object" && !Array.isArray(resp);
        aiText = isObj ? resp.result : String(resp || "");
        setAssessment(aiText);

        // --- Prefer metrics from response; otherwise fallback to Firestore ---
        if (isObj && resp.metrics) {
          setMetrics(resp.metrics || null);
          setLikelyFtt(typeof resp.likelyFtt === "boolean" ? resp.likelyFtt : null);
          setLikelyFttReasons(
            Array.isArray(resp.likelyFttReasons) ? resp.likelyFttReasons : []
          );
        } else {
          // Fallback: fetch the latest saved assessment (server always saves it)
          await fetchLatestAssessmentMetrics(user.uid, activeChildId);
        }

        // Optional: add chat messages
        await addChatMessage(
          user.uid,
          activeChildId,
          "user",
          "New assessment request (existing child)."
        );
        await addChatMessage(user.uid, activeChildId, "assistant", aiText);

        // Refresh charts so the new assessment point appears immediately
        await refreshTrendAssessments(activeChildId);
      } else {
        // NEW child: client prompt route
        const prompt = buildPromptWithTrend({
          form,
          childFromDb,
          previousAssessments,
        });

        aiText = await diagnoseChild(prompt);
        setAssessment(aiText);

        await addAssessment(user.uid, activeChildId, {
          form: { ...form, age: form.ageInMonths },
          assessmentResult: aiText,
        });

        await addChatMessage(user.uid, activeChildId, "user", "Initial assessment request.");
        await addChatMessage(user.uid, activeChildId, "assistant", aiText);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <h2 className="screen-title">Assessment</h2>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="result-box">
        <h3>Select child</h3>
        <select
          className="form-input"
          value={selectedChildId}
          onChange={(e) => handleSelectChild(e.target.value)}
        >
          <option value="">-- New child --</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.childName} ({c.age} months)
            </option>
          ))}
        </select>
        <div style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>
          Choose an existing child to run a new assessment based on percentiles + trend,
          or select “New child”.
        </div>
      </div>

      {selectedChildId && (
        <div className="result-box">
          <h3>Growth trend (existing child)</h3>

          <div style={{ marginTop: 12 }}>
            <h4>Weight vs Age</h4>
            <TrendChartWeight
              points={trendPoints.filter((p) => Number.isFinite(p.weightKg))}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <h4>Height vs Age</h4>
            <TrendChartHeight
              points={trendPoints.filter((p) => Number.isFinite(p.heightCm))}
            />
          </div>

          <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>
            Tip: Run a new assessment below to add a new data point to the trend.
          </div>
        </div>
      )}

      <form className="form" onSubmit={handleSubmit}>
        <label className="form-label">
          Child name
          <input
            className="form-input"
            name="childName"
            value={form.childName}
            onChange={handleChange}
            required
            disabled={Boolean(selectedChildId)}
          />
        </label>

        <label className="form-label">
          Age
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="form-input"
              type="number"
              min="0"
              name="ageValue"
              value={form.ageValue}
              onChange={handleChange}
              required
            />
            <select
              className="form-input"
              name="ageUnit"
              value={form.ageUnit}
              onChange={handleChange}
            >
              <option value="months">Months</option>
              <option value="years">Years</option>
            </select>
          </div>
        </label>

        <label className="form-label">
          Gender
          <select
            className="form-input"
            name="gender"
            value={form.gender}
            onChange={handleChange}
            required
          >
            <option value="">Select...</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </label>

        <label className="form-label">
          Weight (kg)
          <input
            className="form-input"
            type="number"
            step="0.1"
            name="weight"
            value={form.weight}
            onChange={handleChange}
            required
          />
        </label>

        <label className="form-label">
          Height (cm)
          <input
            className="form-input"
            type="number"
            step="0.1"
            name="height"
            value={form.height}
            onChange={handleChange}
            required
          />
        </label>

        <label className="form-label">
          Symptoms
          <textarea
            className="form-textarea"
            name="symptoms"
            value={form.symptoms}
            onChange={handleChange}
          />
        </label>

        <label className="form-label">
          Additional notes
          <textarea
            className="form-textarea"
            name="notes"
            value={form.notes}
            onChange={handleChange}
          />
        </label>

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Analysing..." : "Run Assessment"}
        </button>
      </form>

      {assessment && (
        <div className="result-box">
          <h3>Assessment Result</h3>
          <pre>{assessment}</pre>

          {/* Percentiles (CDC) section for existing child assessments */}
          {metrics && (
            <div style={{ marginTop: 14 }}>
              <h4 style={{ margin: "8px 0" }}>Growth percentiles (CDC)</h4>

              <div style={{ lineHeight: 1.8 }}>
                <div>
                  <b>Weight-for-age:</b>{" "}
                  {fmtPercentile(metrics?.weightForAge?.percentile) || "N/A"}
                  {fmtZ(metrics?.weightForAge?.z) ? (
                    <span style={{ opacity: 0.8 }}>
                      {" "}
                      (z={fmtZ(metrics?.weightForAge?.z)})
                    </span>
                  ) : null}
                </div>

                <div>
                  <b>Length-for-age:</b>{" "}
                  {fmtPercentile(metrics?.lengthForAge?.percentile) || "N/A"}
                  {fmtZ(metrics?.lengthForAge?.z) ? (
                    <span style={{ opacity: 0.8 }}>
                      {" "}
                      (z={fmtZ(metrics?.lengthForAge?.z)})
                    </span>
                  ) : null}
                </div>

                {likelyFtt !== null && (
                  <div style={{ marginTop: 8 }}>
                    <b>Likely FTT (growth-based):</b>{" "}
                    <span style={{ fontWeight: 700 }}>
                      {likelyFtt ? "YES" : "NO"}
                    </span>
                  </div>
                )}

                {likelyFttReasons?.length > 0 && (
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

              <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>
                Percentiles are computed on the server using CDC LMS tables.
              </div>
            </div>
          )}

          <button
            className="btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => onGoChat(childId)}
          >
            Continue Chat
          </button>
        </div>
      )}
    </div>
  );
}
