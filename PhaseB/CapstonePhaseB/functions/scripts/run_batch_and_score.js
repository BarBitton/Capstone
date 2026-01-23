require("dotenv").config();
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const fetch = require("node-fetch");

/**
 * fewshot_eval.js (short documentation)
 * ------------------------------------
 * Offline evaluation script for testing an AI model on physician-labeled FTT severity.
 *
 * Goal:
 * - Load labeled cases from an Excel file.
 * - For each labeled row:
 *   1) Build a few-shot prompt with examples from the same dataset
 *      (balanced: N examples per class 1/2/3, excluding the target row).
 *   2) Send the prompt to a remote diagnose endpoint (DIAGNOSE_URL).
 *   3) Parse the model output to get a severity prediction (1/2/3).
 *   4) Compare prediction to teacher/physician label.
 *   5) Track accuracy + confusion matrix.
 * - Save results into:
 *   - fewshot_results.csv (row-by-row predictions)
 *   - fewshot_report.json (summary metrics)
 *
 * Why few-shot?
 * - The prompt includes labeled examples so the model can imitate the physician rubric/style.
 * - This is "in-context learning": no training is done, only prompting.
 */

// ================= CONFIG =================
const XLS_PATH = path.join(__dirname, "..", "..", "FTTv8 execution run #100.xls");
const DIAGNOSE_URL = process.env.DIAGNOSE_URL;
const DELAY_MS = 550;

// how many labeled examples per class to include in prompt
const EXAMPLES_PER_CLASS = 6; // 6x3 = 18 examples total

// Teacher column
const TEACHER_COL_HE = "הערכת חומרה לפי רופא: 1 =קל 2 =בינוני 3 =קשה";
const TEACHER_COL_EN = "Severity";

// Columns used in prompt (include ALL that may influence teacher rubric)
const PERCENTILE_COLS = [
  "Birth Percentile", "6-month Percentile", "12-month Percentile", "18-month Percentile",
  "24-month Percentile", "36-month Percentile", "48-month Percentile", "60-month Percentile",
];
const WEIGHT_COLS = [
  "Birth Weight", "6-month Weight", "12-month Weight", "18-month Weight",
  "24-month Weight", "36-month Weight", "48-month Weight", "60-month Weight",
];
const CROSS_COLS = [
  "Period 1 Percentiles Crossed",
  "Period 2 Percentiles Crossed",
  "Period 3 Percentiles Crossed",
  "Major Percentiles Crossed",
];

function sleep(ms) {
  // Delay between API calls to reduce rate-limit / server load
  return new Promise((r) => setTimeout(r, ms));
}

function safe(v) {
  // Standard helper: convert null/undefined to "", trim strings
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function getTeacherSeverity(row) {
  /**
   * Extracts the physician/teacher severity label from the row.
   * Expected labels are 1, 2, or 3.
   */
  let t = safe(row[TEACHER_COL_HE]) || safe(row[TEACHER_COL_EN]);
  t = t.replace(/[^\d]/g, "");
  if (t === "1" || t === "2" || t === "3") return Number(t);
  return null;
}

function formatRowForPrompt(row) {
  /**
   * Converts one Excel row into a structured text block for the prompt.
   * Includes:
   * - basic identifiers
   * - weights and percentiles at multiple ages
   * - percentile crossing features
   * - additional teacher notes (if available)
   *
   * This text is intended to resemble a "case report" for the model.
   */
  const id = safe(row["Id"]);
  const gender = safe(row["Gender"]);
  const indication = safe(row["Postnatal Growth Indication"]);
  const ron = safe(row["הערכת רון"]);
  const whyWrong = safe(row["הסבר למה מודל טעה"]);
  const note = safe(row["הערה"]);

  const weights = WEIGHT_COLS.map((c) => `- ${c}: ${safe(row[c])}`).join("\n");
  const percentiles = PERCENTILE_COLS.map((c) => `- ${c}: ${safe(row[c])}`).join("\n");
  const crosses = CROSS_COLS.map((c) => `- ${c}: ${safe(row[c])}`).join("\n");

  return `
Case:
- Id: ${id}
- Gender: ${gender}

Weights:
${weights}

Percentiles:
${percentiles}

Crossings:
${crosses}

Postnatal Growth Indication:
${indication || "(none)"}

Ron assessment / teacher notes (may exist):
- Ron assessment: ${ron || "(none)"}
- Explanation why model was wrong (if present): ${whyWrong || "(none)"}
- Note: ${note || "(none)"}
`.trim();
}

function buildFewShotPrompt(examples, targetRow) {
  /**
   * Builds a few-shot prompt with labeled examples + an unlabeled target case.
   * The model is instructed to output ONLY:
   *   Classification: 1|2|3
   */
  const examplesText = examples
    .map((ex, i) => {
      return `
Example ${i + 1} (Physician severity = ${ex.teacher}):
${formatRowForPrompt(ex.row)}
`.trim();
    })
    .join("\n\n");

  const targetText = formatRowForPrompt(targetRow);

  return `
You are evaluating pediatric Failure to Thrive (FTT) severity using the SAME rubric as the physician labels shown in the examples.

You MUST learn the physician's labeling style from the examples below, then label the target case.

Allowed outputs:
Classification: 1
Classification: 2
Classification: 3

Rules:
- Output ONLY one line: "Classification: <1|2|3>"
- Do NOT include any other text.
- Do NOT output "Refer", "Normal", or any other label.

Labeled examples:
${examplesText}

Target case (unlabeled):
${targetText}

Now output the classification line only.
`.trim();
}

async function callDiagnose(prompt) {
  /**
   * Sends the prompt to the model endpoint.
   *
   * Expected endpoint behavior:
   * - POST { prompt }
   * - returns JSON with "result" (or raw text)
   */
  const res = await fetch(DIAGNOSE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { _raw: raw };
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }
  return data;
}

function parseClassificationNumber(modelText) {
  /**
   * Tries to parse the model output into {1,2,3}.
   * Supports:
   * - "Classification: 2"
   * - or just "2" (fallback)
   */
  const t = safe(modelText);
  const m = t.match(/Classification:\s*([123])/i);
  if (m) return Number(m[1]);

  const m2 = t.match(/\b([123])\b/);
  if (m2) return Number(m2[1]);

  return null;
}

function initCM() {
  // 3x3 confusion matrix
  return {
    "1": { "1": 0, "2": 0, "3": 0 },
    "2": { "1": 0, "2": 0, "3": 0 },
    "3": { "1": 0, "2": 0, "3": 0 },
  };
}

function addCM(cm, actual, pred) {
  // Add one count for (actual, predicted)
  cm[String(actual)][String(pred)] += 1;
}

function accuracyFromCM(cm) {
  // Computes overall accuracy from the confusion matrix
  let correct = 0,
    total = 0;
  for (const a of ["1", "2", "3"]) {
    for (const p of ["1", "2", "3"]) {
      total += cm[a][p];
      if (a === p) correct += cm[a][p];
    }
  }
  return total === 0 ? 0 : correct / total;
}

function csvEscape(s) {
  /**
   * Escapes text for CSV output:
   * - wraps in quotes if needed
   * - doubles quotes inside the string
   */
  const str = safe(s);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function pickExamplesPerClass(allRows, excludeIndex) {
  /**
   * Picks a balanced set of examples for the few-shot prompt:
   * - EXAMPLES_PER_CLASS from class 1
   * - EXAMPLES_PER_CLASS from class 2
   * - EXAMPLES_PER_CLASS from class 3
   *
   * Excludes the current target row (excludeIndex) to avoid leakage.
   *
   * Note:
   * - The selection is deterministic (first N rows per class).
   */
  const buckets = { 1: [], 2: [], 3: [] };

  for (let i = 0; i < allRows.length; i++) {
    if (i === excludeIndex) continue;
    const t = getTeacherSeverity(allRows[i]);
    if (t === 1 || t === 2 || t === 3) {
      buckets[t].push({ row: allRows[i], teacher: t });
    }
  }

  const examples = [];
  for (const cls of [1, 2, 3]) {
    examples.push(...buckets[cls].slice(0, EXAMPLES_PER_CLASS));
  }
  return examples;
}

async function main() {
  /**
   * Main evaluation loop:
   * - Iterate through all labeled rows
   * - Build few-shot prompt
   * - Call DIAGNOSE_URL
   * - Parse prediction and compare to teacher label
   * - Save CSV row results + final report JSON
   */
  if (!DIAGNOSE_URL) {
    console.error("ERROR: DIAGNOSE_URL missing in functions/.env");
    process.exit(1);
  }
  if (!fs.existsSync(XLS_PATH)) {
    console.error("ERROR: XLS file not found:", XLS_PATH);
    process.exit(1);
  }

  const wb = XLSX.readFile(XLS_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  console.log(`Loaded ${rows.length} rows`);
  console.log(`Calling: ${DIAGNOSE_URL}`);
  console.log(
    `Few-shot examples per class: ${EXAMPLES_PER_CLASS} (total ${
      EXAMPLES_PER_CLASS * 3
    })`
  );

  const cm = initCM();
  let scored = 0;

  // CSV header row
  const out = [];
  out.push(
    ["Id", "TeacherSeverity", "ModelSeverity", "IsCorrect", "SourcesUsed", "RawModelText"].join(
      ","
    )
  );

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = safe(r["Id"]);
    const teacher = getTeacherSeverity(r);

    if (teacher === null) {
      // skip unscorable rows
      continue;
    }

    const examples = pickExamplesPerClass(rows, i);
    const prompt = buildFewShotPrompt(examples, r);

    console.log(`\n[${scored + 1}/100] ID=${id}... teacher=${teacher} sending...`);

    let resp;
    try {
      resp = await callDiagnose(prompt);
    } catch (e) {
      // If request fails, log row as error and continue
      console.error("FAILED:", e.message);
      out.push(
        [
          csvEscape(id),
          csvEscape(String(teacher)),
          csvEscape(""),
          csvEscape("0"),
          csvEscape(""),
          csvEscape("ERROR: " + e.message),
        ].join(",")
      );
      await sleep(DELAY_MS);
      continue;
    }

    const modelText = resp.result || resp._raw || "";
    const pred = parseClassificationNumber(modelText);

    const isCorrect = pred === teacher ? 1 : 0;
    scored += 1;

    // Only add to CM if prediction is valid (1/2/3)
    if (pred === 1 || pred === 2 || pred === 3) {
      addCM(cm, teacher, pred);
    }

    // Optional: store which knowledge sources were used (if server returns them)
    const sourcesUsed = Array.isArray(resp.sourcesUsed)
      ? resp.sourcesUsed
          .map((s) => (typeof s === "string" ? s : s.source))
          .filter(Boolean)
          .join(" | ")
      : "";

    out.push(
      [
        csvEscape(id),
        csvEscape(String(teacher)),
        csvEscape(pred ? String(pred) : "INVALID"),
        csvEscape(String(isCorrect)),
        csvEscape(sourcesUsed),
        csvEscape(modelText),
      ].join(",")
    );

    console.log(
      `OK. pred=${pred ?? "INVALID"} correct=${isCorrect} sources=${
        sourcesUsed ? "YES" : "NO"
      }`
    );

    await sleep(DELAY_MS);
  }

  const acc = accuracyFromCM(cm);

  const report = {
    scoredRows: scored,
    accuracy: acc,
    confusionMatrix: cm,
    examplesPerClass: EXAMPLES_PER_CLASS,
    note: "Few-shot in-context learning using physician-labeled examples from the same dataset (excluding the target row).",
  };

  const outCsvPath = path.join(__dirname, "..", "fewshot_results.csv");
  const outReportPath = path.join(__dirname, "..", "fewshot_report.json");

  fs.writeFileSync(outCsvPath, out.join("\n"), "utf8");
  fs.writeFileSync(outReportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\n====================");
  console.log(`Scored rows: ${scored}`);
  console.log(`Few-shot accuracy: ${(acc * 100).toFixed(2)}%`);
  console.log("Saved:", outCsvPath);
  console.log("Saved:", outReportPath);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
