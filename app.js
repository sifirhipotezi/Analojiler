/* analogy localization review
   - loads ./data/analogies_items_private.json (meta + items)
   - all 48 items in fixed order (by ITEM_ID) so reviewers can resume
   - no randomization; Next always enabled; no auto-advance on selection
   - Finish anytime → download localization JSON and show end screen
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
const localizationEdits = new Map(); // ITEM_ID -> { stem_tr, A_tr, ..., note }

const el = (id) => document.getElementById(id);

function uid() {
  return "att_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

// fixed order: all items sorted by ITEM_ID so reviewers can resume from where they stopped
function buildForm(items) {
  return items.slice().sort((a, b) => (a.ITEM_ID || "").localeCompare(b.ITEM_ID || "", undefined, { numeric: true }));
}

function choiceText(item, key) {
  const k = `${key}_${lang}`;
  return item[k] ?? "";
}

function stemText(item) {
  const k = `STEM_${lang}`;
  return item[k] ?? "";
}

function getLocalizationRecord(item) {
  let rec = localizationEdits.get(item.ITEM_ID);
  if (!rec) {
    rec = {
      item_id: item.ITEM_ID,
      stem_tr: "",
      A_tr: "",
      B_tr: "",
      C_tr: "",
      D_tr: "",
      E_tr: "",
      note: ""
    };
    localizationEdits.set(item.ITEM_ID, rec);
  }
  return rec;
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

function isTextEntryTarget(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest("input, textarea, [contenteditable='true']");
}

function renderChoices(item) {
  const container = el("choices");
  container.innerHTML = "";

  const keys = ["A","B","C","D","E"];
  const selected = selectedKeyFor(item);
  const locRec = getLocalizationRecord(item);

  keys.forEach((k) => {
    const div = document.createElement("div");
    div.className = "choice" + (selected === k ? " selected" : "");
    div.dataset.key = k;

    const selectArea = document.createElement("div");
    selectArea.className = "choice-select";
    selectArea.tabIndex = 0;
    selectArea.setAttribute("role", "button");
    selectArea.style.display = "flex";
    selectArea.style.gap = "10px";
    selectArea.style.alignItems = "flex-start";
    selectArea.style.flex = "1 1 auto";

    const keySpan = document.createElement("div");
    keySpan.className = "key";
    keySpan.textContent = k;

    const txt = document.createElement("div");
    txt.className = "txt";
    txt.textContent = choiceText(item, k);

    const input = document.createElement("input");
    input.className = "loc-input";
    input.type = "text";
    input.placeholder = "TR önerisi (seçenek)";
    const fieldKey = `${k}_tr`;
    input.value = locRec[fieldKey] || "";
    input.addEventListener("input", (e) => {
      const r = getLocalizationRecord(item);
      r[fieldKey] = e.target.value;
    });
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => e.stopPropagation());

    selectArea.appendChild(keySpan);
    selectArea.appendChild(txt);
    div.appendChild(selectArea);
    div.appendChild(input);

    selectArea.addEventListener("click", () => onSelect(item, k));
    selectArea.addEventListener("keydown", (e) => {
      if (isTextEntryTarget(e.target)) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(item, k);
      }
    });

    container.appendChild(div);
  });

  el("nextBtn").disabled = false;
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
  renderStemEdit(item);
  renderChoices(item);
  renderDev(item);
  renderNoteBox(item);

  itemEnterT = performance.now();
  el("backBtn").disabled = (idx === 0);
}

function renderStemEdit(item) {
  const row = el("stemEditRow");
  const locRec = getLocalizationRecord(item);
  row.innerHTML = "";

  const label = document.createElement("div");
  label.className = "loc-label";
  label.textContent = "TR uyarıcı önerisi:";

  const input = document.createElement("input");
  input.className = "loc-input";
  input.type = "text";
  input.placeholder = "STEM_TR için yeni formülasyon";
  input.value = locRec.stem_tr || "";
  input.addEventListener("input", (e) => {
    const r = getLocalizationRecord(item);
    r.stem_tr = e.target.value;
  });

  row.appendChild(label);
  row.appendChild(input);
}

function renderNoteBox(item) {
  const wrap = el("noteRow");
  const locRec = getLocalizationRecord(item);
  wrap.innerHTML = "";

  const textarea = document.createElement("textarea");
  textarea.placeholder = "Bu madde için notlar (anlam, frekans, kültürel yük, GPT/Gemini önerileri vb.)";
  textarea.value = locRec.note || "";
  textarea.addEventListener("input", (e) => {
    const r = getLocalizationRecord(item);
    r.note = e.target.value;
  });

  wrap.appendChild(textarea);
}

function onSelect(item, key) {
  const now = performance.now();
  const rt = Math.max(0, Math.round(now - itemEnterT));

  responses.set(item.ITEM_ID, {
    chosen: key,
    rt_ms: rt,
    ts: new Date().toISOString()
  });

  renderChoices(item);
  renderDev(item);
}

function next() {
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

function buildLocalizationPayload() {
  const rows = [];

  for (const item of bankItems) {
    const rec = localizationEdits.get(item.ITEM_ID);
    if (!rec) continue;

    const hasContent =
      (rec.stem_tr && rec.stem_tr.trim()) ||
      (rec.A_tr && rec.A_tr.trim()) ||
      (rec.B_tr && rec.B_tr.trim()) ||
      (rec.C_tr && rec.C_tr.trim()) ||
      (rec.D_tr && rec.D_tr.trim()) ||
      (rec.E_tr && rec.E_tr.trim()) ||
      (rec.note && rec.note.trim());

    if (!hasContent) continue;

    rows.push({
      item_id: item.ITEM_ID,
      ITEM_TYPE: item.ITEM_TYPE,
      P_PLUS: item.P_PLUS,
      MAJORITY_TAG: item.MAJORITY_TAG,

      STEM_TR_original: item.STEM_TR,
      STEM_TR_suggestion: rec.stem_tr || null,

      A_TR_original: item.A_TR,
      A_TR_suggestion: rec.A_tr || null,
      B_TR_original: item.B_TR,
      B_TR_suggestion: rec.B_tr || null,
      C_TR_original: item.C_TR,
      C_TR_suggestion: rec.C_tr || null,
      D_TR_original: item.D_TR,
      D_TR_suggestion: rec.D_tr || null,
      E_TR_original: item.E_TR,
      E_TR_suggestion: rec.E_tr || null,

      note: rec.note || null
    });
  }

  return {
    bank_version: bankMeta?.bank_version ?? null,
    generated_at: new Date().toISOString(),
    count_items_with_edits: rows.length,
    edits: rows
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

  el("endMessage").textContent = "";
  el("endMessage").classList.add("hidden");

  el("testScreen").classList.add("hidden");
  el("endScreen").classList.remove("hidden");
}

function finishReview() {
  const payload = buildLocalizationPayload();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  downloadJson(payload, `analogies_localization_${stamp}.json`);

  el("endMessage").textContent = "Localization JSON downloaded. Restart to continue reviewing from the start.";
  el("endMessage").classList.remove("hidden");
  el("rawScore").textContent = "-";
  el("fixedCorrect").textContent = "-";
  el("fixedTotal").textContent = String(form.length);
  el("rotAnswered").textContent = "-";

  el("testScreen").classList.add("hidden");
  el("endScreen").classList.remove("hidden");
}

function start() {
  attemptId = uid();
  startedAt = new Date().toISOString();
  idx = 0;
  responses.clear();
  localizationEdits.clear();

  form = buildForm(bankItems);

  el("startScreen").classList.add("hidden");
  el("endScreen").classList.add("hidden");
  el("testScreen").classList.remove("hidden");

  renderItem();
}

function restart() {
  idx = 0;
  responses.clear();
  localizationEdits.clear();
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
    const active = document.activeElement;
    const inInput = isTextEntryTarget(active);
    if (inInput) return;

    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") back();
    if (e.key === " ") {
      e.preventDefault();
      next();
    }
    // A-E shortcuts intentionally disabled to protect text entry.
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

  el("countsPill").textContent = `items: ${bankItems.length}`;

  return { bankItems: bankItems.length };
}

function wireUi() {
  el("startBtn").addEventListener("click", start);
  el("restartBtn").addEventListener("click", restart);
  el("langBtn").addEventListener("click", toggleLang);
  el("devBtn").addEventListener("click", toggleDev);

  el("nextBtn").addEventListener("click", next);
  el("backBtn").addEventListener("click", back);
  el("finishBtn").addEventListener("click", finishReview);

  el("downloadBtn").addEventListener("click", () => {
    const payload = buildAttemptPayload();
    downloadJson(payload, `${attemptId}.json`);
  });

  el("locDownloadBtn").addEventListener("click", () => {
    const payload = buildLocalizationPayload();
    const ver = bankMeta?.bank_version ?? "unknown";
    downloadJson(payload, `analogies_localization_${ver}.json`);
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
