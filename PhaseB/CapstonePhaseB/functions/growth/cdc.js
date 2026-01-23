// functions/growth/cdc.js
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

/**
 * cdc.js (short documentation)
 * ---------------------------
 * Backend utility for calculating CDC growth percentiles (infants).
 *
 * What this file does:
 * 1) Loads CDC LMS tables from CSV files (only once, cached in memory)
 * 2) Computes:
 *    - Weight-for-age (WFA) z-score + percentile
 *    - Length-for-age (LFA) z-score + percentile
 * 3) Provides a simple explainable heuristic to decide "Likely FTT"
 *    using current values + historical trend (percentile band crossing).
 *
 * Files used (in functions/data):
 * - WTAGEINF.csv  → weight-for-age LMS table
 * - LENAGEINF.csv → length-for-age LMS table
 */

let WTAGEINF = null;
let LENAGEINF = null;

// --- Math helpers (normal CDF) ---
function erf(x) {
  // Approximation of the error function (used to compute normal CDF)
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) *
      Math.exp(-x * x);

  return sign * y;
}

function normalCdf(z) {
  // Standard normal cumulative distribution function
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

function zToPercentile(z) {
  // Converts z-score to percentile (0-100)
  return Math.max(0, Math.min(100, normalCdf(z) * 100));
}

// CDC LMS z-score formula
function lmsZ({ L, M, S }, X) {
  // LMS method used by CDC growth charts:
  // - X is the measurement (kg/cm)
  // - L, M, S come from the CDC table for given age and sex
  if (L === 0) return Math.log(X / M) / S;
  return (Math.pow(X / M, L) - 1) / (L * S);
}

function loadCsvOnce(filename) {
  /**
   * Loads a CDC CSV file and converts rows to numeric fields.
   * This is called through ensureLoaded() and cached globally.
   */
  const full = path.join(__dirname, "..", "data", filename);
  const text = fs.readFileSync(full, "utf8");
  const records = parse(text, { columns: true, skip_empty_lines: true });

  return records.map((r) => ({
    Sex: Number(r.Sex), // 1=male, 2=female
    Agemos: Number(r.Agemos), // age in months (half-month points)
    L: Number(r.L),
    M: Number(r.M),
    S: Number(r.S),
  }));
}

function findClosestByAge(table, sex, ageMonths) {
  /**
   * CDC tables for infants use half-month ages: 0, 0.5, 1.5, 2.5, ...
   * This function picks the closest matching row for:
   * - sex (1/2)
   * - age in months (rounded to nearest half-month)
   */
  let agemos = ageMonths <= 0 ? 0 : Math.floor(ageMonths) + 0.5;

  let row = table.find((r) => r.Sex === sex && r.Agemos === agemos);
  if (row) return row;

  const candidates = table.filter((r) => r.Sex === sex);
  if (!candidates.length) return null;

  let best = candidates[0];
  let bestDist = Math.abs(best.Agemos - agemos);

  for (const c of candidates) {
    const d = Math.abs(c.Agemos - agemos);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

function ensureLoaded() {
  // Lazy-load and cache tables so we don't read CSV on every request
  if (!WTAGEINF) WTAGEINF = loadCsvOnce("WTAGEINF.csv");
  if (!LENAGEINF) LENAGEINF = loadCsvOnce("LENAGEINF.csv");
}

// Public API: compute WFA + LFA percentiles (CDC infants)
function computeInfantPercentiles({ gender, ageMonths, weightKg, lengthCm }) {
  /**
   * computeInfantPercentiles
   * -----------------------
   * Calculates CDC percentiles and z-scores for infant growth.
   *
   * Input:
   * - gender: "male" / "female"
   * - ageMonths: number
   * - weightKg: number
   * - lengthCm: number
   *
   * Output:
   * {
   *   weightForAge: { z, percentile } | null,
   *   lengthForAge: { z, percentile } | null
   * }
   */
  ensureLoaded();

  // Map project gender -> CDC sex (1 male, 2 female)
  const sex = String(gender).toLowerCase() === "male" ? 1 : 2;

  const wRow = findClosestByAge(WTAGEINF, sex, ageMonths);
  const lRow = findClosestByAge(LENAGEINF, sex, ageMonths);

  const out = {
    weightForAge: null,
    lengthForAge: null,
  };

  if (wRow && Number.isFinite(weightKg)) {
    const z = lmsZ(wRow, weightKg);
    out.weightForAge = { z, percentile: zToPercentile(z) };
  }

  if (lRow && Number.isFinite(lengthCm)) {
    const z = lmsZ(lRow, lengthCm);
    out.lengthForAge = { z, percentile: zToPercentile(z) };
  }

  return out;
}

/**
 * assessLikelyFtt (short explanation)
 * ----------------------------------
 * Explainable rule-based decision for "Likely FTT".
 *
 * It returns:
 * - likelyFtt: boolean
 * - reasons: array of strings (human readable)
 *
 * Rules:
 * 1) If current WFA < 5th OR current LFA < 5th → Likely FTT
 * 2) If percentile dropped across at least 2 "major percentile bands" over time
 *    (based on history, not only last measurement) → Likely FTT
 *
 * Note:
 * - previous can be null, a single object, or an array (recommended).
 */

const BANDS = [3, 5, 10, 25, 50, 75, 90, 95, 97];

function bandIndex(p) {
  // Converts a percentile value into a band index (used to count crossings)
  let idx = 0;
  for (let i = 0; i < BANDS.length; i++) {
    if (p >= BANDS[i]) idx = i;
  }
  return idx;
}

function normalizePrev(previous) {
  // Ensures history is always an array
  if (!previous) return [];
  return Array.isArray(previous) ? previous : [previous];
}

function bestPercentileOverHistory(prevArr, key) {
  // Finds the best (highest) percentile in the history for a specific metric
  let best = null;
  for (const m of prevArr) {
    const p = m?.[key]?.percentile;
    if (Number.isFinite(p)) {
      if (best === null || p > best) best = p;
    }
  }
  return best;
}

function latestValidPercentile(prevArr, key) {
  // Returns the newest valid percentile (assumes prevArr may be newest->oldest)
  for (const m of prevArr) {
    const p = m?.[key]?.percentile;
    if (Number.isFinite(p)) return p;
  }
  return null;
}

function assessLikelyFtt({ current, previous }) {
  const reasons = [];

  const wfa = current?.weightForAge?.percentile;
  const lfa = current?.lengthForAge?.percentile;

  let likely = false;

  // Rule 1: low current percentiles
  if (Number.isFinite(wfa) && wfa < 5) {
    likely = true;
    reasons.push("Weight-for-age is below the 5th percentile.");
  }
  if (Number.isFinite(lfa) && lfa < 5) {
    likely = true;
    reasons.push("Length-for-age is below the 5th percentile.");
  }

  // Rule 2: trend / percentile crossing using history
  const prevArr = normalizePrev(previous);

  const bestWfa = bestPercentileOverHistory(prevArr, "weightForAge");
  const bestLfa = bestPercentileOverHistory(prevArr, "lengthForAge");

  const prevWfaNewest = latestValidPercentile(prevArr, "weightForAge");
  const prevLfaNewest = latestValidPercentile(prevArr, "lengthForAge");

  // If drop across >=2 bands from BEST history -> current, mark as likely FTT
  if (Number.isFinite(wfa) && Number.isFinite(bestWfa)) {
    const dropBands = bandIndex(bestWfa) - bandIndex(wfa);
    if (dropBands >= 2) {
      likely = true;
      reasons.push(
        `Weight-for-age dropped from a previous high around the ${bestWfa.toFixed(
          1
        )}th to ${wfa.toFixed(1)}th percentile (crossing ${dropBands} major percentile bands).`
      );
    } else if (Number.isFinite(prevWfaNewest)) {
      const shortDrop = bandIndex(prevWfaNewest) - bandIndex(wfa);
      if (shortDrop >= 1) {
        reasons.push(
          `Weight-for-age decreased compared with the last measurement (${prevWfaNewest.toFixed(
            1
          )}th → ${wfa.toFixed(1)}th), but did not cross 2 major bands.`
        );
      }
    }
  }

  if (Number.isFinite(lfa) && Number.isFinite(bestLfa)) {
    const dropBands = bandIndex(bestLfa) - bandIndex(lfa);
    if (dropBands >= 2) {
      likely = true;
      reasons.push(
        `Length-for-age dropped from a previous high around the ${bestLfa.toFixed(
          1
        )}th to ${lfa.toFixed(1)}th percentile (crossing ${dropBands} major percentile bands).`
      );
    } else if (Number.isFinite(prevLfaNewest)) {
      const shortDrop = bandIndex(prevLfaNewest) - bandIndex(lfa);
      if (shortDrop >= 1) {
        reasons.push(
          `Length-for-age decreased compared with the last measurement (${prevLfaNewest.toFixed(
            1
          )}th → ${lfa.toFixed(1)}th), but did not cross 2 major bands.`
        );
      }
    }
  }

  // If no rules fired, return a neutral reason
  if (!reasons.length) {
    reasons.push(
      "No low percentiles or major downward percentile crossing was detected from the available data."
    );
  }

  return { likelyFtt: likely, reasons };
}

module.exports = {
  computeInfantPercentiles,
  assessLikelyFtt,
};
