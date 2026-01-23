const API_BASE = import.meta.env.PROD
  ? "https://us-central1-capstonephaseb-ftt.cloudfunctions.net/api"
  : "http://127.0.0.1:5001/capstonephaseb-ftt/us-central1/api";

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Server error: ${res.status} – ${text}`);
  return JSON.parse(text);
}

export async function diagnoseChild(prompt) {
  const data = await postJson(`${API_BASE}/diagnose`, { prompt });
  return data.result;
}

export async function chatWithModel({ uid, childId, message }) {
  const data = await postJson(`${API_BASE}/chat`, { uid, childId, message });
  return data.result;
}

// NEW: existing child assessment with CDC percentiles + Likely FTT
export async function assessExistingChild({ uid, childId, form }) {
  const data = await postJson(`${API_BASE}/assessExisting`, { uid, childId, form });
  return data; // { result, metrics, likelyFtt, likelyFttReasons, sourcesUsed }
}
