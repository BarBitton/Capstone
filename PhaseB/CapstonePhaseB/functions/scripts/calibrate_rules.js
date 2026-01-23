const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");

/**
 * calibrate_severity_rules.js (short documentation)
 * -----------------------------------------------
 * Offline calibration script for tuning a rule-based "severity" classifier.
 *
 * Goal:
 * - Compare a simple heuristic model (based on percentile crossing features)
 *   against the teacher/doctor labeled severity in an Excel file.
 * - Run a small grid search over threshold parameters.
 * - Pick the parameter set with the best overall accuracy.
 * - Save the best configuration to calibration_best.json for later use.
 *
 * Input:
 * - Excel file: FTTv8 execution run #100.xls
 *
 * Output:
 * - JSON file: calibration_best.json
 *   Includes:
 *   - best accuracy
 *   - best parameter thresholds
 *   - confusion matrix
 */

// ================= CONFIG =================
const XLS_PATH = path.join(__dirname, "..", "..", "FTTv8 execution run #100.xls");

// Teacher/doctor label column name (Hebrew + fallback English)
const TEACHER_COL_HE = "הערכת חומרה לפי רופא: 1 =קל 2 =בינוני 3 =קשה";
const TEACHER_COL_EN = "Severity";

// Feature columns used for the heuristic
const COL_MAJOR_CROSSED = "Major Percentiles Crossed";
const COL_P1 = "Period 1 Percentiles Crossed";
const COL_P2 = "Period 2 Percentiles Crossed";
const COL_P3 = "Period 3 Percentiles Crossed";

// Percentile columns used to detect extreme low percentiles (e.g., < 3rd)
const PERCENTILE_COLS = [
  "Birth Percentile",
  "6-month Percentile",
  "12-month Percentile",
  "18-month Percentile",
  "24-month Percentile",
  "36-month Percentile",
  "48-month Percentile",
  "60-month Percentile",
];
// ==========================================

function safe(v) {
  // Converts null/undefined to empty string, trims otherwise
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toNumber(v) {
  /**
   * Parses a value into a number.
   * - Removes non-numeric characters
   * - Returns null if invalid
   */
  const s = safe(v);
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function getTeacherSeverity(row) {
  /**
   * Reads the teacher/doctor severity label from the row.
   * Expected labels:
   * - 1 = mild
   * - 2 = moderate
   * - 3 = severe
   *
   * Supports Hebrew column name and English fallback.
   */
  let t = safe(row[TEACHER_COL_HE]) || safe(row[TEACHER_COL_EN]);
  t = t.replace(/[^\d]/g, "");
  if (t === "1" || t === "2" || t === "3") return Number(t);
  return null;
}

function extractFeatures(row) {
  /**
   * Extracts the simplified feature set used by the heuristic:
   * - major: number of major percentile band crossings
   * - sum: total crossings across 3 time periods (p1+p2+p3)
   * - anyBelow3: whether the lowest recorded percentile is below 3rd
   *
   * Note:
   * - Percentile value 0 is ignored (often indicates missing/rounded data).
   */
  const major = toNumber(row[COL_MAJOR_CROSSED]);
  const p1 = toNumber(row[COL_P1]) ?? 0;
  const p2 = toNumber(row[COL_P2]) ?? 0;
  const p3 = toNumber(row[COL_P3]) ?? 0;
  const sum = p1 + p2 + p3;

  let minPercentile = null;
  for (const c of PERCENTILE_COLS) {
    const p = toNumber(row[c]);
    if (p === null) continue;
    if (p === 0) continue; // treat 0 as missing
    minPercentile = minPercentile === null ? p : Math.min(minPercentile, p);
  }

  const anyBelow3 = minPercentile !== null && minPercentile < 3;

  return { major, sum, anyBelow3 };
}

// Parameterized rule-set
function computeSeverityWithParams(f, params) {
  /**
   * Predicts severity (1/2/3) using thresholds (params).
   *
   * Logic:
   * - Prefer "major" if available (more direct feature)
   * - Otherwise fallback to using the "sum" feature
   * - anyBelow3 can upgrade to severe when combined with crossings
   */
  const { major, sum, anyBelow3 } = f;

  // If Major exists, rely primarily on it
  if (major !== null) {
    // Severe triggers
    if (major >= params.majorSevereAt) return 3;
    if (anyBelow3 && major >= params.below3WithMajorAt) return 3;

    // Moderate triggers
    if (major >= params.majorModerateAt) return 2;

    // Else Mild
    return 1;
  }

  // Fallback using sum
  if (sum >= params.sumSevereAt) return 3;
  if (anyBelow3 && sum >= params.below3WithSumAt) return 3;

  if (sum >= params.sumModerateAt) return 2;
  return 1;
}

function initCM() {
  /**
   * Initializes a 3x3 confusion matrix.
   * cm[actual][predicted] counts how many examples fall into each cell.
   */
  return {
    "1": { "1": 0, "2": 0, "3": 0 },
    "2": { "1": 0, "2": 0, "3": 0 },
    "3": { "1": 0, "2": 0, "3": 0 },
  };
}

function addCM(cm, a, p) {
  // Adds one example to the confusion matrix
  cm[String(a)][String(p)] += 1;
}

function accuracyFromCM(cm) {
  // Computes total accuracy from the confusion matrix
  let correct = 0;
  let total = 0;
  for (const a of ["1", "2", "3"]) {
    for (const p of ["1", "2", "3"]) {
      total += cm[a][p];
      if (a === p) correct += cm[a][p];
    }
  }
  return total === 0 ? 0 : correct / total;
}

function main() {
  /**
   * Main flow:
   * 1) Load Excel file and convert the first sheet to rows
   * 2) Build dataset = { teacher label, extracted features }
   * 3) Run a grid search over threshold parameters
   * 4) Select the parameters with best accuracy
   * 5) Save the best result into calibration_best.json
   */
  if (!fs.existsSync(XLS_PATH)) {
    console.error("ERROR: XLS file not found:", XLS_PATH);
    process.exit(1);
  }

  const wb = XLSX.readFile(XLS_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const dataset = [];
  for (const r of rows) {
    const teacher = getTeacherSeverity(r);
    if (teacher === null) continue;
    dataset.push({ teacher, f: extractFeatures(r) });
  }

  console.log("Scorable rows:", dataset.length);

  // Grid search ranges (small + fast)
  const majorSevereAtList = [2, 3, 4];        // when major crossing => severe
  const majorModerateAtList = [1, 2];         // when major crossing => moderate
  const below3WithMajorAtList = [1, 2, 3];    // below3 + major >= X => severe

  const sumSevereAtList = [4, 5, 6, 7];
  const sumModerateAtList = [2, 3, 4];
  const below3WithSumAtList = [2, 3, 4, 5];

  let best = { acc: -1, params: null, cm: null };

  for (const majorSevereAt of majorSevereAtList) {
    for (const majorModerateAt of majorModerateAtList) {
      // ensure moderate threshold is below severe threshold
      if (majorModerateAt >= majorSevereAt) continue;

      for (const below3WithMajorAt of below3WithMajorAtList) {
        for (const sumSevereAt of sumSevereAtList) {
          for (const sumModerateAt of sumModerateAtList) {
            if (sumModerateAt >= sumSevereAt) continue;

            for (const below3WithSumAt of below3WithSumAtList) {
              const params = {
                majorSevereAt,
                majorModerateAt,
                below3WithMajorAt,
                sumSevereAt,
                sumModerateAt,
                below3WithSumAt,
              };

              const cm = initCM();

              for (const ex of dataset) {
                const pred = computeSeverityWithParams(ex.f, params);
                addCM(cm, ex.teacher, pred);
              }

              const acc = accuracyFromCM(cm);
              if (acc > best.acc) {
                best = { acc, params, cm };
              }
            }
          }
        }
      }
    }
  }

  console.log("\nBEST ACCURACY:", (best.acc * 100).toFixed(2) + "%");
  console.log("BEST PARAMS:", best.params);
  console.log("CONFUSION MATRIX:", best.cm);

  // Save the best result for later use in the project
  const outPath = path.join(__dirname, "..", "calibration_best.json");
  fs.writeFileSync(outPath, JSON.stringify(best, null, 2), "utf8");
  console.log("\nSaved:", outPath);
}

main();
