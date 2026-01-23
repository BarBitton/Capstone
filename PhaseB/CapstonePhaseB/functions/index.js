// functions/index.js
// ------------------------------------------------------------
// Firebase Functions entry point for the backend API.
// This file defines an Express app that exposes HTTP endpoints
// used by the React client (frontend).
//
// Main responsibilities in this file:
// 1) Initialize Firebase Admin SDK (server access to Firestore).
// 2) Provide REST endpoints:
//    - POST /diagnose        : general "diagnose" prompt -> Gemini response
//    - POST /chat            : chat endpoint that builds context from Firestore
//    - POST /assessExisting  : compute CDC percentiles on the server + FTT logic
// 3) Provide a lightweight RAG (retrieval augmented generation) mechanism
//    that pulls relevant chunks from knowledge_base_text.json.
//
// Why server-side?
// - Keeps medical logic (CDC percentiles + FTT rules) consistent and protected.
// - Keeps API keys (Gemini) and knowledge base local to the server.
// - Allows centralized logging/error handling and consistent Firestore writes.
// ------------------------------------------------------------

require("dotenv").config();
const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Timestamp } = require("firebase-admin/firestore");

// CDC percentile calculator + trend-based Likely FTT logic.
// Implemented in: functions/growth/cdc.js
const { computeInfantPercentiles, assessLikelyFtt } = require("./growth/cdc");

// Initialize Firebase Admin SDK (server privileges for Firestore access).
admin.initializeApp();
const db = admin.firestore();

// Create Express app. This is deployed as a single Cloud Function later.
const app = express();

// Enable CORS so the client can call these endpoints from the browser.
// origin:true allows requests from different origins in dev.
app.use(cors({ origin: true }));

// Parse JSON request bodies automatically.
app.use(express.json());

// Gemini client (API key stays on server via environment variables).
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// -------------------- Light RAG (keyword retrieval) --------------------
// This project uses a very simple retrieval approach:
//
// - A file knowledge_base_text.json contains many text chunks extracted from PDFs.
// - For each request, we tokenize the query and score each chunk by keyword hits.
// - We return the topK matching chunks as "evidence" for internal reasoning.
//
// Note: We intentionally do NOT cite these sources to users with [1],[2] etc.
// because the UI/teacher requirement is "no bracket citations".
// ----------------------------------------------------------------------

let KB_TEXT_CACHE = null;

function loadKbText() {
  // Loads knowledge_base_text.json once (cached in memory).
  if (KB_TEXT_CACHE) return KB_TEXT_CACHE;

  const kbPath = path.join(__dirname, "knowledge_base_text.json");
  if (!fs.existsSync(kbPath)) {
    console.warn(
      "Light RAG: knowledge_base_text.json not found. Running without articles."
    );
    KB_TEXT_CACHE = { items: [] };
    return KB_TEXT_CACHE;
  }

  try {
    KB_TEXT_CACHE = JSON.parse(fs.readFileSync(kbPath, "utf8"));
    if (!KB_TEXT_CACHE?.items?.length) KB_TEXT_CACHE = { items: [] };
  } catch (e) {
    console.warn(
      "Light RAG: failed to parse knowledge_base_text.json. Running without articles.",
      e
    );
    KB_TEXT_CACHE = { items: [] };
  }

  return KB_TEXT_CACHE;
}

function tokenize(s) {
  // Tokenizes English-like text for keyword search.
  // Keeps only a-z,0-9 tokens with length >= 3.
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function scoreChunk(queryTokens, chunkText) {
  // Scores a chunk by counting how many query tokens are present.
  // Very simple "bag-of-words includes" scoring.
  if (!chunkText) return 0;
  const text = chunkText.toLowerCase();
  let score = 0;
  for (const t of queryTokens) {
    if (text.includes(t)) score += 1;
  }
  return score;
}

function retrieveEvidenceText(queryText, opts = {}) {
  /**
   * Retrieves topK chunks that match the query tokens.
   *
   * Options:
   * - topK: maximum chunks to return
   * - minHits: minimum keyword hits to consider the chunk relevant
   * - maxChars: truncate each chunk to this length
   */
  const { topK = 4, minHits = 2, maxChars = 900 } = opts;

  const { items } = loadKbText();
  if (!items || items.length === 0) return [];

  const qTokens = Array.from(new Set(tokenize(queryText)));
  if (qTokens.length === 0) return [];

  const scored = items
    .map((it) => ({
      source: it.source,
      text: it.text,
      score: scoreChunk(qTokens, it.text),
    }))
    .sort((a, b) => b.score - a.score);

  const selected = [];
  for (const s of scored) {
    if (selected.length >= topK) break;
    if (s.score < minHits) break;

    selected.push({
      source: s.source,
      score: s.score,
      text: (s.text || "").slice(0, maxChars),
    });
  }

  return selected;
}

// Formats evidence into a block that is ONLY for internal reasoning.
// We include "Source: filename" but the model is instructed NOT to cite it.
function formatEvidenceBlock(evidence) {
  if (!evidence || evidence.length === 0) return "";

  const lines = evidence.map((e) => {
    const cleanText = String(e.text || "").replace(/\s+/g, " ").trim();
    return `- ${cleanText} (Source: ${e.source})`;
  });

  return `\nEvidence excerpts (for internal reasoning only; do NOT cite or reference explicitly):\n${lines.join(
    "\n"
  )}\n`;
}

// Failsafe: removes citation-like brackets if the model returns them anyway.
function stripBracketCitations(s) {
  return String(s || "")
    .replace(/\[\s*\d+\s*\]/g, "")
    .replace(/\[\s*[A-Za-z]\s*\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// -------------------- Prompt helpers --------------------
// These functions build consistent prompts for the model,
// combining user text + child profile + latest assessment + chat history + evidence.
// --------------------------------------------------------

function buildChatPrompt({
  child,
  latestAssessment,
  messages,
  userMessage,
  evidenceBlock,
}) {
  const childBlock = child
    ? `Child profile:
- Name: ${child.childName || "Unknown"}
- Age (months): ${child.age || ""}
- Gender: ${child.gender || ""}
- Weight (kg): ${child.weight || ""}
- Height (cm): ${child.height || ""}
- Symptoms: ${child.symptoms || ""}
- Notes: ${child.notes || ""}`
    : "Child profile: Not available";

  const assessmentBlock = latestAssessment
    ? `Latest assessment result:
${latestAssessment.assessmentResult || ""}`
    : "Latest assessment result: Not available";

  const historyBlock =
    messages && messages.length
      ? messages
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
          .join("\n")
      : "No prior chat messages.";

  return `
You are a pediatric growth deficiency assistant (FTT-focused).
You must be careful, evidence-based, and advise contacting a clinician when needed.
Do NOT claim certainty. Provide clear next steps.
Do not mention that you are an AI.

ABSOLUTE OUTPUT RULES:
- Do NOT include citation markers or bracketed references of any kind, e.g. [1], [2], [A], (1).
- Do NOT include a reference list/bibliography.
- If you rely on clinical knowledge, refer generally: "based on pediatric growth guidelines" / "standard clinical practice".
- Evidence excerpts below are ONLY for internal reasoning; NEVER cite or reference them explicitly.

If the child’s growth metrics appear normal, state clearly:
"This does not look like classic Failure to Thrive based on growth alone."
Still address symptoms separately.

${evidenceBlock || ""}

${childBlock}

${assessmentBlock}

Conversation so far:
${historyBlock}

User message:
${userMessage}

Reply in concise English.
`;
}

function wrapDiagnosePrompt(originalPrompt, evidenceBlock) {
  // Wraps the raw client prompt with safety + formatting instructions,
  // and attaches evidenceBlock for internal reasoning.
  return `
You are a pediatric growth deficiency assistant (FTT-focused).
Write in clear, natural English. Do not mention that you are an AI.
Be careful and evidence-based. Recommend in-person evaluation if there are red flags.

ABSOLUTE OUTPUT RULES:
- Do NOT include citation markers or bracketed references of any kind, e.g. [1], [2], [A], (1).
- Do NOT include a reference list/bibliography.
- Evidence excerpts below are ONLY for internal reasoning; NEVER cite or reference them explicitly.

${evidenceBlock || ""}

User prompt:
${originalPrompt}
`;
}

// -------------------- Routes --------------------
// Express routes that the React client calls through functions/api.
// ------------------------------------------------

// POST /diagnose
// - Used for a general "diagnosis" generation based on a given prompt.
// - Also attaches evidence from the knowledge base (optional).
app.post("/diagnose", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).send({ error: "Missing prompt" });

    // Retrieve evidence by keyword matching against the prompt text.
    const evidence = retrieveEvidenceText(prompt, { topK: 4, minHits: 2 });
    const evidenceBlock = formatEvidenceBlock(evidence);

    // Wrap prompt with rules + evidence.
    const finalPrompt = wrapDiagnosePrompt(prompt, evidenceBlock);

    // Call Gemini model.
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent(finalPrompt);

    // Clean output from bracket citations (failsafe).
    const text = stripBracketCitations(result.response.text());

    // Respond with model result + what sources were retrieved (for debugging / evaluation).
    res.status(200).send({
      result: text,
      sourcesUsed: evidence.map((e) => ({ source: e.source, score: e.score })),
    });
  } catch (error) {
    console.error("Gemini API error:", error);
    res.status(500).send({
      error: "Gemini error",
      details: String(error?.message || error),
    });
  }
});

// POST /chat
// - Chat endpoint: loads child profile + latest assessment + last chat messages
//   then asks the model to answer the user's message.
app.post("/chat", async (req, res) => {
  try {
    const { uid, childId, message } = req.body;
    if (!uid || !childId || !message) {
      return res.status(400).send({ error: "Missing uid/childId/message" });
    }

    // Child profile
    const childRef = db.doc(`users/${uid}/children/${childId}`);
    const childSnap = await childRef.get();
    const child = childSnap.exists ? childSnap.data() : null;

    // Latest assessment (plus extra buffer in case you want more context later)
    const assessmentsRef = childRef.collection("assessments");
    const latestAssessmentSnap = await assessmentsRef
      .orderBy("createdAt", "desc")
      .limit(6)
      .get();

    const latestAssessment = latestAssessmentSnap.empty
      ? null
      : latestAssessmentSnap.docs[0].data();

    // Last N chat messages for conversation context
    const chatRef = childRef.collection("chat");
    const chatSnap = await chatRef
      .orderBy("createdAt", "asc")
      .limitToLast(15)
      .get();

    const messages = chatSnap.docs.map((d) => d.data());

    // Build a retrieval query for evidence (includes child + symptoms + last assessment).
    const ragQuery = `
User message: ${message}
Child: name=${child?.childName || ""}, age_months=${child?.age || ""}, gender=${
      child?.gender || ""
    }
Symptoms: ${child?.symptoms || ""}
Latest assessment: ${latestAssessment?.assessmentResult || ""}
`.trim();

    const evidence = retrieveEvidenceText(ragQuery, { topK: 3, minHits: 2 });
    const evidenceBlock = formatEvidenceBlock(evidence);

    // Build the chat prompt used by Gemini.
    const prompt = buildChatPrompt({
      child,
      latestAssessment,
      messages,
      userMessage: message,
      evidenceBlock,
    });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent(prompt);
    const text = stripBracketCitations(result.response.text());

    res.status(200).send({
      result: text,
      sourcesUsed: evidence.map((e) => ({ source: e.source, score: e.score })),
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).send({
      error: "Chat failed",
      details: String(error?.message || error),
    });
  }
});

/**
 * POST /assessExisting
 * ------------------------------------------------------------
 * Server-side assessment for an EXISTING child.
 *
 * Why server-side?
 * - CDC percentile calculation uses official LMS tables (CSV files) and should
 *   not be exposed or modifiable by clients.
 * - Keeps results consistent and prevents tampering.
 *
 * What it does:
 * 1) Validate inputs (age, weight, height)
 * 2) Load child record from Firestore
 * 3) Load recent assessment history from Firestore (for trend detection)
 * 4) Compute current percentiles using computeInfantPercentiles()
 * 5) Run assessLikelyFtt() using current metrics + history metrics
 * 6) Save assessment document under:
 *    users/{uid}/children/{childId}/assessments
 * 7) Update child profile fields for convenience (age/weight/height/symptoms/notes)
 * 8) Return result + metrics to the client so the UI can show percentiles.
 *
 * Body: { uid: string, childId: string, form: { ageInMonths, gender, weight, height, symptoms, notes } }
 */
app.post("/assessExisting", async (req, res) => {
  try {
    const { uid, childId, form } = req.body;
    if (!uid || !childId || !form) {
      return res.status(400).send({ error: "Missing uid/childId/form" });
    }

    // Convert inputs to numbers for validation + CDC calculations.
    const ageMonths = Number(form.ageInMonths ?? form.age);
    const weightKg = Number(form.weight);
    const heightCm = Number(form.height);

    // Basic validation: avoid invalid values.
    if (
      !Number.isFinite(ageMonths) ||
      ageMonths < 0 ||
      !Number.isFinite(weightKg) ||
      weightKg <= 0 ||
      !Number.isFinite(heightCm) ||
      heightCm <= 0
    ) {
      return res.status(400).send({ error: "Invalid age/weight/height" });
    }

    // Load child document
    const childRef = db.doc(`users/${uid}/children/${childId}`);
    const childSnap = await childRef.get();
    if (!childSnap.exists) {
      return res.status(404).send({ error: "Child not found" });
    }
    const child = childSnap.data();

    const assRef = childRef.collection("assessments");

    // Pull last N assessments for history-aware trend.
    const HISTORY_N = 8;
    const historySnap = await assRef
      .orderBy("createdAt", "desc")
      .limit(HISTORY_N)
      .get();

    const history = historySnap.docs.map((d) => d.data());

    // Extract metrics history array for trend logic (newest -> oldest).
    const previousMetricsArr = history
      .map((h) => h?.metrics)
      .filter(Boolean);

    // Compute CDC percentiles now (server uses LMS tables from cdc.js).
    const currentMetrics = computeInfantPercentiles({
      gender: form.gender ?? child.gender,
      ageMonths,
      weightKg,
      lengthCm: heightCm,
    });

    // Run rule-based Likely FTT logic using full metric history.
    const ftt = assessLikelyFtt({
      current: currentMetrics,
      previous: previousMetricsArr,
    });

    // If not likely FTT: return a short message (still saves metrics).
    if (!ftt.likelyFtt) {
      const hasPriorConcern =
        (ftt.reasons || []).some((r) =>
          String(r).toLowerCase().includes("dropped")
        ) ||
        (ftt.reasons || []).some((r) =>
          String(r).toLowerCase().includes("below the 5th")
        );

      const shortText = hasPriorConcern
        ? "Not currently FTT, but there was prior growth concern. Continue monitoring the trend."
        : "This is NOT FTT.";

      // Save assessment document for history + charts.
      await assRef.add({
        createdAt: Timestamp.now(),
        assessmentResult: shortText,
        form: { ...form, ageInMonths: ageMonths },
        metrics: currentMetrics,
        likelyFtt: false,
        likelyFttReasons: ftt.reasons || [],
        sourcesUsed: [],
      });

      // Update child profile "current snapshot".
      await childRef.update({
        age: ageMonths,
        gender: form.gender ?? child.gender,
        weight: weightKg,
        height: heightCm,
        symptoms: form.symptoms ?? child.symptoms,
        notes: form.notes ?? child.notes,
        updatedAt: Timestamp.now(),
      });

      return res.status(200).send({
        result: shortText,
        metrics: currentMetrics,
        likelyFtt: false,
        likelyFttReasons: ftt.reasons || [],
        sourcesUsed: [],
      });
    }

    // If Likely FTT: ask Gemini for a full explanation using computed metrics.
    const ragQuery = `
FTT evaluation.
AgeMonths=${ageMonths}
Gender=${form.gender ?? child.gender}
WeightKg=${weightKg}
HeightCm=${heightCm}
Symptoms=${form.symptoms || ""}
Notes=${form.notes || ""}
WFA=${currentMetrics.weightForAge?.percentile ?? "NA"}
LFA=${currentMetrics.lengthForAge?.percentile ?? "NA"}
LikelyFTT=YES
Reasons=${(ftt.reasons || []).join(" ")}
`.trim();

    const evidence = retrieveEvidenceText(ragQuery, { topK: 3, minHits: 2 });
    const evidenceBlock = formatEvidenceBlock(evidence);

    // Pre-format the computed percentiles so the model uses them explicitly.
    const metricsBlock = `
Computed growth metrics (CDC LMS infant tables):
- Weight-for-age: ${
      currentMetrics.weightForAge
        ? `${currentMetrics.weightForAge.percentile.toFixed(
            1
          )}th percentile (z=${currentMetrics.weightForAge.z.toFixed(2)})`
        : "N/A"
    }
- Length-for-age: ${
      currentMetrics.lengthForAge
        ? `${currentMetrics.lengthForAge.percentile.toFixed(
            1
          )}th percentile (z=${currentMetrics.lengthForAge.z.toFixed(2)})`
        : "N/A"
    }

Rule-based FTT flag:
- Likely FTT: YES
- Reasons: ${(ftt.reasons || []).join(" ")}
`.trim();

    // Prompt to Gemini to produce an explanation + next steps.
    const prompt = `
You are a pediatric clinical assistant supporting parents and clinicians in evaluating child growth concerns.
Write in clear, natural English. Do not mention that you are an AI.
Be reassuring but honest. If there are red flags, state them clearly.

ABSOLUTE OUTPUT RULES (must follow):
- Do NOT include citation markers or bracketed references of any kind, e.g. [1], [2], [A], (1).
- Do NOT include a reference list/bibliography.
- Do NOT write "as noted in ..." with references.
- If you rely on clinical knowledge, refer generally: "based on pediatric growth guidelines" / "standard clinical practice".
- Evidence excerpts below are ONLY for internal reasoning; NEVER cite or reference them explicitly.

${evidenceBlock || ""}

Child (current input):
- Name: ${child.childName || "Unknown"}
- Age: ${ageMonths} months
- Gender: ${form.gender ?? child.gender ?? ""}
- Weight: ${weightKg} kg
- Height/Length: ${heightCm} cm
- Symptoms: ${form.symptoms || "Not specified"}
- Notes: ${form.notes || "None"}

${metricsBlock}

Tasks:
1) Start with exactly: "Likely FTT: YES"
2) Explain what Failure to Thrive (FTT) means in plain language.
3) Explain WHY this child meets FTT concern using the percentiles and trend logic (percentile crossing over time matters).
4) List common causes of FTT grouped into:
   - inadequate intake
   - malabsorption
   - increased metabolic needs
   - psychosocial factors
5) Give next steps (3–6 items). If urgent red flags are suspected, advise in-person evaluation urgently.
6) If nutrition-related and no urgent red flags, add: "Food ideas & simple recipes" with 3–5 toddler-friendly, calorie-dense options.

Keep it concise.
`.trim();

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent(prompt);
    const text = stripBracketCitations(result.response.text());

    // Save full assessment + metrics in Firestore.
    await assRef.add({
      createdAt: Timestamp.now(),
      assessmentResult: text,
      form: { ...form, ageInMonths: ageMonths },
      metrics: currentMetrics,
      likelyFtt: true,
      likelyFttReasons: ftt.reasons || [],
      sourcesUsed: evidence.map((e) => ({ source: e.source, score: e.score })),
    });

    // Update child profile snapshot.
    await childRef.update({
      age: ageMonths,
      gender: form.gender ?? child.gender,
      weight: weightKg,
      height: heightCm,
      symptoms: form.symptoms ?? child.symptoms,
      notes: form.notes ?? child.notes,
      updatedAt: Timestamp.now(),
    });

    // Return to client so UI can show percentiles + Likely FTT reasons.
    return res.status(200).send({
      result: text,
      metrics: currentMetrics,
      likelyFtt: true,
      likelyFttReasons: ftt.reasons || [],
      sourcesUsed: evidence.map((e) => ({ source: e.source, score: e.score })),
    });
  } catch (err) {
    console.error("assessExisting error:", err);
    return res.status(500).send({
      error: "assessExisting failed",
      details: String(err?.message || err),
    });
  }
});

// Export as a single Firebase HTTPS Function.
// Client calls: https://<region>-<project>.cloudfunctions.net/api/<route>
exports.api = functions.https.onRequest(app);
