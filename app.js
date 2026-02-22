/* minimal analogy prototype
   - loads ./data/analogies_items_private.json (meta + items)
   - assembles 40 items: 32 fixed + 8 random rotation
   - fully randomizes order
   - auto-advances on selection
   - scores fixed only
*/

const JSON_PATH = "./data/analogies_items_private.json";

let bankMeta = null;
let bankItems = [];
let form = [];

let lang = "TR";     // TR or EN
let devMode = false;

let idx = 0;
let attemptId = null;
let startedAt = null;

let itemEnterT = 0;
const responses = new Map(); // ITEM_ID -> { chosen, rt_ms, ts }

const el = (id) => document.getElementById(id);

function uid() {
  return "att_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

// deterministic seeded rng for reproducible shuffles per attempt id
function hashToSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildForm(items, seedStr) {
  const rng = mulberry32(hashToSeed(seedStr));

  const fixed = items.filter(x => x.ITEM_TYPE === "FIXED");
  const rotation = items.filter(x => x.ITEM_TYPE === "ROTATION");

  const fixedShuf = shuffleWithRng(fixed, rng);
  const rot8 = shuffleWithRng(rotation, rng).slice(0, 8);

  const combined = fixedShuf.concat(rot8);

  // fully randomize final 40
  return shuffleWithRng(combined, rng);
}

function choiceText(item, key) {
  const k = `${key}_${lang}`;
  return item[k] ?? "";
}

function stemText(item) {
  const k = `STEM_${lang}`;
  return item[k] ?? "";
}

function formatStemForDisplay(item) {
  // normalize spacing around ":" just in case your data isn’t consistent
  const raw = stemText(item) || "";
  const normalized = raw.replace(/\s*:\s*/g, " : ").trim();
  return `${normalized} :: ? : ?`;
}

function setTag(item) {
  const tag = el("typeTag");
  const t = (item.ITEM_TYPE || "").toLowerCase();
  tag.textContent = t || "unknown";
  tag.classList.remove("fixed", "rotation");
  if (t === "fixed") tag.classList.add("fixed");
  if (t === "rotation") tag.classList.add("rotation");
}

function setProgress() {
  el("progressText").textContent = `item ${idx + 1} / ${form.length}`;
  const pct = ((idx + 1) / form.length) * 100;
  el("barFill").style.width = `${pct}%`;
}

function selectedKeyFor(item) {
  const rec = responses.get(item.ITEM_ID);
  return rec ? rec.chosen : null;
}

function renderChoices(item) {
  const container = el("choices");
  container.innerHTML = "";

  const keys = ["A","B","C","D","E"];
  const selected = selectedKeyFor(item);

  keys.forEach((k) => {
    const div = document.createElement("div");
    div.className = "choice" + (selected === k ? " selected" : "");
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.dataset.key = k;

    const keySpan = document.createElement("div");
    keySpan.className = "key";
    keySpan.textContent = k;

    const txt = document.createElement("div");
    txt.className = "txt";
    txt.textContent = choiceText(item, k);

    div.appendChild(keySpan);
    div.appendChild(txt);

    div.addEventListener("click", () => onSelect(item, k));
    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") onSelect(item, k);
    });

    container.appendChild(div);
  });

  el("nextBtn").disabled = !selectedKeyFor(item);
}

function renderDev(item) {
  const box = el("devInfo");
  if (!devMode) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");

  const rec = responses.get(item.ITEM_ID);
  const chosen = rec?.chosen ?? null;
  const rt = rec?.rt_ms ?? null;

  box.textContent =
    `ITEM_ID: ${item.ITEM_ID}\n` +
    `ITEM_TYPE: ${item.ITEM_TYPE}\n` +
    `P_PLUS: ${item.P_PLUS}\n` +
    `ANSWER_KEY: ${item.ANSWER_KEY}\n` +
    `CHOSEN: ${chosen}\n` +
    `RT_MS: ${rt}\n` +
    `MAJORITY_TAG: ${item.MAJORITY_TAG ?? ""}\n` +
    `ROTATION_REASON: ${item.ROTATION_REASON ?? ""}\n`;
}

function renderItem() {
  const item = form[idx];
  setProgress();
  setTag(item);
  el("stem").textContent = formatStemForDisplay(item);
  renderChoices(item);
  renderDev(item);

  itemEnterT = performance.now();
  el("backBtn").disabled = (idx === 0);
}

function onSelect(item, key) {
  const now = performance.now();
  const rt = Math.max(0, Math.round(now - itemEnterT));

  responses.set(item.ITEM_ID, {
    chosen: key,
    rt_ms: rt,
    ts: new Date().toISOString()
  });

  // update ui quickly, then auto-advance
  renderChoices(item);
  renderDev(item);

  setTimeout(() => next(), 80);
}

function next() {
  const item = form[idx];
  if (!responses.get(item.ITEM_ID)) return;

  if (idx < form.length - 1) {
    idx += 1;
    renderItem();
  } else {
    finish();
  }
}

function back() {
  if (idx > 0) {
    idx -= 1;
    renderItem();
  }
}

function computeScore() {
  let fixedTotal = 0;
  let fixedCorrect = 0;
  let rotAnswered = 0;

  for (const item of form) {
    const rec = responses.get(item.ITEM_ID);
    const answered = !!rec?.chosen;

    if (item.ITEM_TYPE === "FIXED") {
      fixedTotal += 1;
      if (answered && rec.chosen === item.ANSWER_KEY) fixedCorrect += 1;
    } else if (item.ITEM_TYPE === "ROTATION") {
      if (answered) rotAnswered += 1;
    }
  }

  return { fixedTotal, fixedCorrect, raw: fixedCorrect, rotAnswered };
}

function buildAttemptPayload() {
  const endedAt = new Date().toISOString();
  const rows = form.map((item, order) => {
    const rec = responses.get(item.ITEM_ID) || {};
    const chosen = rec.chosen ?? null;
    const isCorrect = chosen ? (chosen === item.ANSWER_KEY) : null;

    return {
      attempt_id: attemptId,
      bank_version: bankMeta?.bank_version ?? null,
      started_at: startedAt,
      ended_at: endedAt,

      order,
      item_id: item.ITEM_ID,
      item_type: item.ITEM_TYPE,
      p_plus: item.P_PLUS,

      lang_presented: lang,
      chosen_key: chosen,
      answer_key: item.ANSWER_KEY, // DO NOT do this in production
      correct: isCorrect,
      rt_ms: rec.rt_ms ?? null,
      ts: rec.ts ?? null
    };
  });

  return {
    meta: {
      attempt_id: attemptId,
      bank_version: bankMeta?.bank_version ?? null,
      started_at: startedAt,
      ended_at: endedAt,
      assembled_counts: {
        fixed: form.filter(x => x.ITEM_TYPE === "FIXED").length,
        rotation: form.filter(x => x.ITEM_TYPE === "ROTATION").length
      }
    },
    responses: rows
  };
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function finish() {
  const s = computeScore();

  el("rawScore").textContent = String(s.raw);
  el("fixedCorrect").textContent = String(s.fixedCorrect);
  el("fixedTotal").textContent = String(s.fixedTotal);
  el("rotAnswered").textContent = String(s.rotAnswered);

  el("testScreen").classList.add("hidden");
  el("endScreen").classList.remove("hidden");
}

function start() {
  attemptId = uid();
  startedAt = new Date().toISOString();
  idx = 0;
  responses.clear();

  form = buildForm(bankItems, attemptId);

  el("startScreen").classList.add("hidden");
  el("endScreen").classList.add("hidden");
  el("testScreen").classList.remove("hidden");

  renderItem();
}

function restart() {
  idx = 0;
  responses.clear();
  form = [];

  el("testScreen").classList.add("hidden");
  el("endScreen").classList.add("hidden");
  el("startScreen").classList.remove("hidden");

  el("reviewBox").classList.add("hidden");
}

function applyLangToDom() {
  document.documentElement.dataset.lang = lang.toLowerCase();
}
function toggleLang() {
  lang = (lang === "TR") ? "EN" : "TR";
  el("langBtn").textContent = `lang: ${lang.toLowerCase()}`;
  if (!el("testScreen").classList.contains("hidden") && form.length) renderItem();
}

function toggleDev() {
  devMode = !devMode;
  el("devBtn").textContent = `dev: ${devMode ? "on" : "off"}`;
  if (!el("testScreen").classList.contains("hidden") && form.length) renderDev(form[idx]);
}

function setupKeys() {
  document.addEventListener("keydown", (e) => {
    if (el("testScreen").classList.contains("hidden")) return;
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") back();

    const k = e.key.toUpperCase();
    if (["A","B","C","D","E"].includes(k)) onSelect(form[idx], k);
  });
}

async function loadBank() {
  const res = await fetch(JSON_PATH, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to load json: ${res.status}`);
  const data = await res.json();

  bankMeta = data.meta ?? null;
  bankItems = data.items ?? [];

  el("bankInfo").textContent =
    `items: ${bankItems.length} • bank_version: ${bankMeta?.bank_version ?? "unknown"}`;

  const fixedN = bankItems.filter(x => x.ITEM_TYPE === "FIXED").length;
  const rotN = bankItems.filter(x => x.ITEM_TYPE === "ROTATION").length;
  el("countsPill").textContent = `fixed: ${fixedN} • rotation pool: ${rotN}`;

  return { fixedN, rotN };
}

function wireUi() {
  el("startBtn").addEventListener("click", start);
  el("restartBtn").addEventListener("click", restart);
  el("langBtn").addEventListener("click", toggleLang);
  el("devBtn").addEventListener("click", toggleDev);

  el("nextBtn").addEventListener("click", next);
  el("backBtn").addEventListener("click", back);

  el("downloadBtn").addEventListener("click", () => {
    const payload = buildAttemptPayload();
    downloadJson(payload, `${attemptId}.json`);
  });

  el("reviewBtn").addEventListener("click", () => {
    const payload = buildAttemptPayload();
    const box = el("reviewBox");
    box.textContent = JSON.stringify(payload, null, 2);
    box.classList.toggle("hidden");
  });
}

(async function main(){
  wireUi();
  setupKeys();
  applyLangToDom();
  try {
    await loadBank();
  } catch (err) {
    el("bankInfo").textContent = `error: ${err.message}`;
    console.error(err);
  }
})();