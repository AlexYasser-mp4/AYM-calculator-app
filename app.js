"use strict";

const DEFAULT_RATES = {
  shoot: 150,
  perMinute: 250,
  revisionRound: 150,
  crew: 50,
  camera: 100,
  location: 75,
  drone: 250,
  gimbal: 100,
  lighting: 150,
  audio: 125,
  teleprompter: 100,
  rawFootage: 200,
  freeMiles: 30,
  perMile: 0.7,
  roundTo: 0,
};

const DEFAULT_DELIVERABLES = [
  { label: "Hero video", seconds: 60, qty: 1 },
];

const DELIVERABLE_PRESETS = [
  "Hero video", "Social cutdown", "Reel / short", "Teaser",
  "Interview edit", "Recap / highlights", "Vertical version", "Custom",
];

const SERVICE_LABELS = {
  wedding: "Wedding",
  event: "Event / Conference",
  corporate: "Corporate / Brand",
  commercial: "Commercial / Promo",
  musicVideo: "Music Video",
  realEstate: "Real Estate",
  socialContent: "Social Media Content",
  documentary: "Documentary / Interview",
  other: "Other",
};

const RATES_KEY = "aym.rates.v1";
const FORM_KEY = "aym.form.v1";
const PRESETS_KEY = "aym.presets.v1";
const QUOTES_KEY = "aym.quotes.v1";
const STUDIO_KEY = "aym-studio-v1"; // shared with studio.js

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function loadRates() {
  try {
    const saved = JSON.parse(localStorage.getItem(RATES_KEY) || "{}");
    return { ...DEFAULT_RATES, ...saved };
  } catch {
    return { ...DEFAULT_RATES };
  }
}
function saveRates(rates) {
  localStorage.setItem(RATES_KEY, JSON.stringify(rates));
}

let rates = loadRates();

let deliverables = DEFAULT_DELIVERABLES.map((d) => ({ ...d }));
let customLines = []; // [{ desc, amt }]

function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]"); }
  catch { return []; }
}
function savePresets(list) { localStorage.setItem(PRESETS_KEY, JSON.stringify(list)); }

function loadQuotes() {
  try { return JSON.parse(localStorage.getItem(QUOTES_KEY) || "[]"); }
  catch { return []; }
}
function saveQuotes(list) { localStorage.setItem(QUOTES_KEY, JSON.stringify(list)); }

function loadStudioClients() {
  try {
    const s = JSON.parse(localStorage.getItem(STUDIO_KEY) || "{}");
    return Array.isArray(s.clients) ? s.clients : [];
  } catch { return []; }
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function readForm() {
  const addons = {};
  document.querySelectorAll('[data-addon]').forEach((el) => {
    addons[el.dataset.addon] = el.checked;
  });
  return {
    projectName: $("projectName").value.trim(),
    serviceType: $("serviceType").value,
    linkedClient: $("linkedClient") ? $("linkedClient").value : "",
    shootHours: +$("shootHours").value || 0,
    cameras: +$("cameras").value || 1,
    extraCrew: +$("extraCrew").value || 0,
    locations: +$("locations").value || 1,
    deliverables: deliverables.slice(),
    customLines: customLines.slice(),
    includedRevisions: +$("includedRevisions").value || 0,
    extraRevisions: +$("extraRevisions").value || 0,
    editComplexity: +$("editComplexity").value || 1,
    travelMiles: +$("travelMiles").value || 0,
    turnaround: +$("turnaround").value || 1,
    usage: +$("usage").value || 1,
    discount: +$("discount").value || 0,
    tax: +$("tax").value || 0,
    deposit: +$("deposit").value || 0,
    addons,
  };
}

function persistForm(f) {
  localStorage.setItem(FORM_KEY, JSON.stringify(f));
}
function restoreForm() {
  try {
    const f = JSON.parse(localStorage.getItem(FORM_KEY) || "null");
    if (!f) return;
    if (f.projectName != null) $("projectName").value = f.projectName;
    if (f.serviceType) $("serviceType").value = f.serviceType;
    [
      "shootHours","cameras","extraCrew","locations",
      "includedRevisions","extraRevisions",
      "editComplexity","travelMiles","turnaround",
      "usage","discount","tax","deposit",
    ].forEach((k) => { if (f[k] != null && $(k)) $(k).value = f[k]; });
    if (Array.isArray(f.deliverables) && f.deliverables.length) {
      deliverables = f.deliverables.map((d) => ({
        label: String(d.label || "Deliverable"),
        seconds: +d.seconds || 0,
        qty: +d.qty || 1,
      }));
    }
    if (Array.isArray(f.customLines)) {
      customLines = f.customLines.map((c) => ({
        desc: String(c.desc || ""),
        amt: +c.amt || 0,
      }));
    }
    if (f.linkedClient != null && $("linkedClient")) $("linkedClient").value = f.linkedClient;
    if (f.addons) {
      document.querySelectorAll('[data-addon]').forEach((el) => {
        el.checked = !!f.addons[el.dataset.addon];
      });
    }
  } catch {}
}

function renderDeliverablesList() {
  const wrap = $("deliverablesList");
  wrap.innerHTML = "";
  deliverables.forEach((d, idx) => {
    const row = document.createElement("div");
    row.className = "deliv-row";

    const label = document.createElement("input");
    label.type = "text";
    label.placeholder = "Deliverable name";
    label.value = d.label;
    label.setAttribute("list", "deliverablePresets");
    label.addEventListener("input", (e) => { deliverables[idx].label = e.target.value; render(); });

    const secs = document.createElement("input");
    secs.type = "number";
    secs.min = "0";
    secs.step = "1";
    secs.placeholder = "sec";
    secs.title = "Length in seconds";
    secs.value = d.seconds;
    secs.addEventListener("input", (e) => { deliverables[idx].seconds = +e.target.value || 0; render(); });

    const qty = document.createElement("input");
    qty.type = "number";
    qty.min = "1";
    qty.step = "1";
    qty.placeholder = "qty";
    qty.title = "Quantity";
    qty.value = d.qty;
    qty.addEventListener("input", (e) => { deliverables[idx].qty = +e.target.value || 1; render(); });

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "icon danger";
    rm.title = "Remove";
    rm.textContent = "×";
    rm.addEventListener("click", () => {
      deliverables.splice(idx, 1);
      if (deliverables.length === 0) deliverables.push({ label: "Deliverable", seconds: 60, qty: 1 });
      renderDeliverablesList();
      render();
    });

    row.appendChild(label);
    row.appendChild(secs);
    row.appendChild(qty);
    row.appendChild(rm);
    wrap.appendChild(row);
  });

  if (!document.getElementById("deliverablePresets")) {
    const dl = document.createElement("datalist");
    dl.id = "deliverablePresets";
    DELIVERABLE_PRESETS.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      dl.appendChild(opt);
    });
    document.body.appendChild(dl);
  }
}

function renderCustomLines() {
  const wrap = $("customLinesList");
  if (!wrap) return;
  wrap.innerHTML = "";
  customLines.forEach((c, idx) => {
    const row = document.createElement("div");
    row.className = "custom-row";

    const desc = document.createElement("input");
    desc.type = "text";
    desc.placeholder = "Description";
    desc.value = c.desc;
    desc.addEventListener("input", (e) => { customLines[idx].desc = e.target.value; render(); });

    const amt = document.createElement("input");
    amt.type = "number";
    amt.min = "0";
    amt.step = "0.01";
    amt.placeholder = "$";
    amt.value = c.amt;
    amt.addEventListener("input", (e) => { customLines[idx].amt = +e.target.value || 0; render(); });

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "icon danger";
    rm.title = "Remove";
    rm.textContent = "×";
    rm.addEventListener("click", () => {
      customLines.splice(idx, 1);
      renderCustomLines();
      render();
    });

    row.appendChild(desc);
    row.appendChild(amt);
    row.appendChild(rm);
    wrap.appendChild(row);
  });
}

function renderPresetChips() {
  const wrap = $("presetChips");
  if (!wrap) return;
  wrap.innerHTML = "";
  const presets = loadPresets();
  if (presets.length === 0) {
    wrap.appendChild(Object.assign(document.createElement("span"), {
      className: "chip-empty",
      textContent: "No templates yet. Build a quote and save it as a template.",
    }));
    return;
  }
  presets.forEach((p) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip-btn";
    chip.textContent = p.name;
    chip.title = "Load this template";
    chip.addEventListener("click", () => loadPreset(p.id));

    const x = document.createElement("span");
    x.className = "chip-x";
    x.textContent = "×";
    x.title = "Delete template";
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm(`Delete template "${p.name}"?`)) return;
      savePresets(loadPresets().filter((q) => q.id !== p.id));
      renderPresetChips();
    });
    chip.appendChild(x);
    wrap.appendChild(chip);
  });
}

function populateClientPicker() {
  const sel = $("linkedClient");
  if (!sel) return;
  const current = sel.value;
  const clients = loadStudioClients();
  sel.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "— None —";
  sel.appendChild(none);
  clients.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  sel.value = current;
}

function calculate() {
  const f = readForm();
  const items = [];

  const shootSubtotal = rates.shoot * f.shootHours;
  if (shootSubtotal > 0) {
    items.push({
      desc: `Shoot — ${f.shootHours}h @ ${fmt(rates.shoot)}/h`,
      amt: shootSubtotal,
    });
  }

  if (f.extraCrew > 0 && f.shootHours > 0) {
    const crewAmt = rates.crew * f.extraCrew * f.shootHours;
    items.push({
      desc: `${f.extraCrew} extra crew × ${f.shootHours}h @ ${fmt(rates.crew)}/h`,
      amt: crewAmt,
    });
  }

  if (f.cameras > 1) {
    const camAmt = rates.camera * (f.cameras - 1);
    items.push({
      desc: `${f.cameras - 1} extra camera setup${f.cameras - 1 > 1 ? "s" : ""}`,
      amt: camAmt,
    });
  }

  if (f.locations > 1) {
    const locAmt = rates.location * (f.locations - 1);
    items.push({
      desc: `${f.locations - 1} extra location${f.locations - 1 > 1 ? "s" : ""}`,
      amt: locAmt,
    });
  }

  // Post-production: priced per finished minute of video, per deliverable line.
  const cmxLabel = f.editComplexity > 1 ? ` × ${f.editComplexity}× complexity` : "";
  f.deliverables.forEach((d) => {
    const minutes = (d.seconds || 0) / 60;
    if (minutes <= 0 || d.qty <= 0) return;
    const each = rates.perMinute * minutes * f.editComplexity;
    const total = each * d.qty;
    const lenLabel = d.seconds >= 60
      ? `${(minutes).toFixed(minutes % 1 === 0 ? 0 : 1)} min`
      : `${d.seconds}s`;
    items.push({
      desc: `${d.label || "Deliverable"} — ${d.qty} × ${lenLabel} @ ${fmt(rates.perMinute)}/min${cmxLabel}`,
      amt: total,
    });
  });

  if (f.extraRevisions > 0 && rates.revisionRound > 0) {
    items.push({
      desc: `${f.extraRevisions} extra revision round${f.extraRevisions > 1 ? "s" : ""} (${f.includedRevisions} included)`,
      amt: rates.revisionRound * f.extraRevisions,
    });
  }

  Object.entries(f.addons).forEach(([key, on]) => {
    if (!on) return;
    const amt = rates[key] || 0;
    if (amt <= 0) return;
    const labels = {
      drone: "Drone / aerial",
      gimbal: "Gimbal package",
      lighting: "Lighting kit",
      audio: "Pro audio package",
      teleprompter: "Teleprompter",
      rawFootage: "Raw footage delivery",
    };
    items.push({ desc: labels[key] || key, amt });
  });

  const billableMiles = Math.max(0, f.travelMiles - rates.freeMiles);
  if (billableMiles > 0 && rates.perMile > 0) {
    const travelAmt = billableMiles * rates.perMile;
    items.push({
      desc: `Travel — ${billableMiles} mi @ ${fmt(rates.perMile)}/mi`,
      amt: travelAmt,
    });
  }

  f.customLines.forEach((c) => {
    if (!c.desc && !c.amt) return;
    if (c.amt <= 0) return;
    items.push({ desc: c.desc || "Custom line", amt: c.amt });
  });

  let baseTotal = items.reduce((s, i) => s + i.amt, 0);

  if (f.turnaround > 1) {
    const surcharge = baseTotal * (f.turnaround - 1);
    items.push({
      desc: `Rush turnaround (+${Math.round((f.turnaround - 1) * 100)}%)`,
      amt: surcharge,
    });
    baseTotal += surcharge;
  }

  if (f.usage > 1) {
    const usageAmt = baseTotal * (f.usage - 1);
    const usageLabels = {
      1.25: "Internal / social media",
      1.5: "Commercial / paid ads",
      2: "Broadcast / national",
    };
    items.push({
      desc: `Licensing — ${usageLabels[f.usage] || "extended"} (+${Math.round((f.usage - 1) * 100)}%)`,
      amt: usageAmt,
    });
    baseTotal += usageAmt;
  }

  const subtotal = baseTotal;
  const discountAmt = subtotal * (f.discount / 100);
  const afterDiscount = subtotal - discountAmt;
  const taxAmt = afterDiscount * (f.tax / 100);
  let total = afterDiscount + taxAmt;
  if (rates.roundTo && rates.roundTo > 0) {
    total = Math.round(total / rates.roundTo) * rates.roundTo;
  }
  const depositAmt = total * (f.deposit / 100);
  const balance = total - depositAmt;

  return { f, items, subtotal, discountAmt, taxAmt, total, depositAmt, balance };
}

function render() {
  const r = calculate();
  persistForm(r.f);

  // Header
  $("quoteTitle").textContent = r.f.projectName || "New project";
  $("quoteSubtitle").textContent =
    `${SERVICE_LABELS[r.f.serviceType]} • ${new Date().toLocaleDateString()}`;

  // Line items
  const ul = $("lineItems");
  ul.innerHTML = "";
  if (r.items.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Fill in the project details to see your quote.";
    ul.appendChild(li);
  } else {
    r.items.forEach((it) => {
      const li = document.createElement("li");
      const d = document.createElement("span");
      d.className = "desc";
      d.textContent = it.desc;
      const a = document.createElement("span");
      a.className = "amt";
      a.textContent = fmt(it.amt);
      li.appendChild(d);
      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  $("subtotal").textContent = fmt(r.subtotal);
  $("discountLabel").textContent = `Discount${r.f.discount ? ` (${r.f.discount}%)` : ""}`;
  $("discountAmt").textContent = r.discountAmt > 0 ? `−${fmt(r.discountAmt)}` : fmt(0);
  $("taxLabel").textContent = `Tax${r.f.tax ? ` (${r.f.tax}%)` : ""}`;
  $("taxAmt").textContent = fmt(r.taxAmt);
  $("total").textContent = fmt(r.total);
  $("depositLabel").textContent = `Deposit due${r.f.deposit ? ` (${r.f.deposit}%)` : ""}`;
  $("depositAmt").textContent = fmt(r.depositAmt);
  $("balanceAmt").textContent = fmt(r.balance);
}

function buildQuoteText() {
  const r = calculate();
  const lines = [];
  lines.push(`QUOTE — ${r.f.projectName || "New project"}`);
  lines.push(`${SERVICE_LABELS[r.f.serviceType]} • ${new Date().toLocaleDateString()}`);
  lines.push("");
  r.items.forEach((it) => {
    lines.push(`  • ${it.desc.padEnd(48)} ${fmt(it.amt)}`);
  });
  lines.push("");
  lines.push(`  Subtotal:        ${fmt(r.subtotal)}`);
  if (r.discountAmt > 0) lines.push(`  Discount (${r.f.discount}%): −${fmt(r.discountAmt)}`);
  if (r.taxAmt > 0) lines.push(`  Tax (${r.f.tax}%):       ${fmt(r.taxAmt)}`);
  lines.push(`  TOTAL:           ${fmt(r.total)}`);
  if (r.depositAmt > 0) {
    lines.push(`  Deposit (${r.f.deposit}%):    ${fmt(r.depositAmt)}`);
    lines.push(`  Balance:         ${fmt(r.balance)}`);
  }
  return lines.join("\n");
}

// Rates dialog
function openRatesDialog() {
  Object.entries(rates).forEach(([k, v]) => {
    const el = $("r_" + k);
    if (el) el.value = v;
  });
  $("ratesDialog").showModal();
}

function handleRatesSubmit(e) {
  const action = e.submitter && e.submitter.value;
  if (action === "save") {
    const next = { ...rates };
    Object.keys(DEFAULT_RATES).forEach((k) => {
      const el = $("r_" + k);
      if (el) next[k] = +el.value || 0;
    });
    rates = next;
    saveRates(rates);
    render();
  } else if (action === "reset") {
    e.preventDefault();
    rates = { ...DEFAULT_RATES };
    saveRates(rates);
    Object.entries(rates).forEach(([k, v]) => {
      const el = $("r_" + k);
      if (el) el.value = v;
    });
    render();
  }
}

function applyPresetShoot(hours) {
  $("shootHours").value = hours;
  render();
}

function addDeliverablePreset(preset) {
  deliverables.push({ ...preset });
  renderDeliverablesList();
  render();
}

function applyDiscountPreset(pct) {
  $("discount").value = pct;
  render();
}

function savePresetFromCurrent() {
  const name = prompt("Template name (e.g. \"Wedding standard\", \"Realtor walkthrough\"):", "");
  if (!name || !name.trim()) return;
  const list = loadPresets();
  const preset = {
    id: uid(),
    name: name.trim(),
    form: readForm(),
    createdAt: Date.now(),
  };
  // Templates are recipes; don't bake in the specific client/project name.
  preset.form.projectName = "";
  preset.form.linkedClient = "";
  list.push(preset);
  savePresets(list);
  renderPresetChips();
}

function loadPreset(id) {
  const p = loadPresets().find((x) => x.id === id);
  if (!p) return;
  const f = p.form;
  if (f.projectName != null) $("projectName").value = f.projectName || $("projectName").value;
  if (f.serviceType) $("serviceType").value = f.serviceType;
  [
    "shootHours","cameras","extraCrew","locations",
    "includedRevisions","extraRevisions",
    "editComplexity","travelMiles","turnaround",
    "usage","discount","tax","deposit",
  ].forEach((k) => { if (f[k] != null && $(k)) $(k).value = f[k]; });
  if (Array.isArray(f.deliverables)) {
    deliverables = f.deliverables.map((d) => ({ ...d }));
  }
  if (Array.isArray(f.customLines)) {
    customLines = f.customLines.map((c) => ({ ...c }));
  }
  if (f.addons) {
    document.querySelectorAll('[data-addon]').forEach((el) => {
      el.checked = !!f.addons[el.dataset.addon];
    });
  }
  renderDeliverablesList();
  renderCustomLines();
  render();
}

function saveQuoteToClient() {
  const clientId = $("linkedClient").value;
  if (!clientId) {
    alert("Pick a client from the \"Link to client\" dropdown first.");
    return;
  }
  const r = calculate();
  const quote = {
    id: uid(),
    clientId,
    projectName: r.f.projectName || "Untitled quote",
    serviceType: r.f.serviceType,
    total: r.total,
    savedAt: Date.now(),
    form: r.f,
  };
  const quotes = loadQuotes();
  quotes.push(quote);
  saveQuotes(quotes);
  const btn = $("saveToClient");
  const original = btn.textContent;
  btn.textContent = "Saved!";
  setTimeout(() => (btn.textContent = original), 1400);
}

function init() {
  restoreForm();
  renderDeliverablesList();
  renderCustomLines();
  populateClientPicker();
  renderPresetChips();

  document.querySelectorAll("#view-calculator input, #view-calculator select").forEach((el) => {
    if (el.closest("#ratesDialog")) return;
    if (el.closest("#deliverablesList")) return; // rows manage their own listeners
    if (el.closest("#customLinesList")) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  // Refresh client picker when the calculator tab is shown, in case clients changed.
  document.querySelectorAll(".tab-nav .tab").forEach((t) => {
    t.addEventListener("click", () => {
      if (t.dataset.tab === "calculator") populateClientPicker();
    });
  });

  // Auto-fill project name when linking a client (only if empty).
  $("linkedClient").addEventListener("change", () => {
    const id = $("linkedClient").value;
    if (!id) return;
    const c = loadStudioClients().find((x) => x.id === id);
    if (c && !$("projectName").value.trim()) {
      $("projectName").value = c.name;
      render();
    }
  });

  $("addDeliverable").addEventListener("click", () => {
    deliverables.push({ label: "Deliverable", seconds: 30, qty: 1 });
    renderDeliverablesList();
    render();
  });

  $("addCustomLine").addEventListener("click", () => {
    customLines.push({ desc: "", amt: 0 });
    renderCustomLines();
    render();
  });

  document.querySelectorAll("[data-preset-shoot]").forEach((btn) => {
    btn.addEventListener("click", () => applyPresetShoot(+btn.dataset.presetShoot));
  });
  document.querySelectorAll("[data-preset-deliv]").forEach((btn) => {
    btn.addEventListener("click", () => {
      try { addDeliverablePreset(JSON.parse(btn.dataset.presetDeliv)); }
      catch {}
    });
  });
  document.querySelectorAll("[data-preset-discount]").forEach((btn) => {
    btn.addEventListener("click", () => applyDiscountPreset(+btn.dataset.presetDiscount));
  });

  $("savePreset").addEventListener("click", savePresetFromCurrent);
  $("saveToClient").addEventListener("click", saveQuoteToClient);

  $("toggleRates").addEventListener("click", openRatesDialog);
  $("ratesDialog").querySelector("form").addEventListener("submit", handleRatesSubmit);

  $("copyQuote").addEventListener("click", async () => {
    const text = buildQuoteText();
    try {
      await navigator.clipboard.writeText(text);
      const btn = $("copyQuote");
      const original = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = original), 1400);
    } catch {
      alert(text);
    }
  });

  $("printQuote").addEventListener("click", () => window.print());

  $("resetForm").addEventListener("click", () => {
    if (!confirm("Clear this quote?")) return;
    localStorage.removeItem(FORM_KEY);
    location.reload();
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
