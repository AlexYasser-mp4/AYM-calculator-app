"use strict";

const DEFAULT_RATES = {
  shoot: 150,
  edit: 75,
  crew: 50,
  camera: 100,
  location: 75,
  deliverable: 100,
  drone: 250,
  gimbal: 100,
  lighting: 150,
  audio: 125,
  teleprompter: 100,
  rawFootage: 200,
  freeMiles: 30,
  perMile: 0.7,
};

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

const SERVICE_MIN = {
  wedding: 1500,
  event: 800,
  corporate: 750,
  commercial: 1200,
  musicVideo: 1000,
  realEstate: 250,
  socialContent: 400,
  documentary: 600,
  other: 0,
};

const RATES_KEY = "aym.rates.v1";
const FORM_KEY = "aym.form.v1";

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

function readForm() {
  const addons = {};
  document.querySelectorAll('[data-addon]').forEach((el) => {
    addons[el.dataset.addon] = el.checked;
  });
  return {
    projectName: $("projectName").value.trim(),
    serviceType: $("serviceType").value,
    shootHours: +$("shootHours").value || 0,
    cameras: +$("cameras").value || 1,
    extraCrew: +$("extraCrew").value || 0,
    locations: +$("locations").value || 1,
    editHours: +$("editHours").value || 0,
    deliverables: +$("deliverables").value || 1,
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
      "shootHours","cameras","extraCrew","locations","editHours",
      "deliverables","editComplexity","travelMiles","turnaround",
      "usage","discount","tax","deposit",
    ].forEach((k) => { if (f[k] != null) $(k).value = f[k]; });
    if (f.addons) {
      document.querySelectorAll('[data-addon]').forEach((el) => {
        el.checked = !!f.addons[el.dataset.addon];
      });
    }
  } catch {}
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

  if (f.editHours > 0) {
    const editBase = rates.edit * f.editHours;
    const editAmt = editBase * f.editComplexity;
    const cmxLabel = f.editComplexity > 1 ? ` × ${f.editComplexity}× complexity` : "";
    items.push({
      desc: `Editing — ${f.editHours}h @ ${fmt(rates.edit)}/h${cmxLabel}`,
      amt: editAmt,
    });
  }

  if (f.deliverables > 1) {
    const delAmt = rates.deliverable * (f.deliverables - 1);
    items.push({
      desc: `${f.deliverables - 1} extra deliverable${f.deliverables - 1 > 1 ? "s" : ""}`,
      amt: delAmt,
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

  // Apply service minimum
  const minimum = SERVICE_MIN[f.serviceType] || 0;
  let subtotal = baseTotal;
  if (subtotal > 0 && subtotal < minimum) {
    items.push({
      desc: `${SERVICE_LABELS[f.serviceType]} package minimum`,
      amt: minimum - subtotal,
    });
    subtotal = minimum;
  }

  const discountAmt = subtotal * (f.discount / 100);
  const afterDiscount = subtotal - discountAmt;
  const taxAmt = afterDiscount * (f.tax / 100);
  const total = afterDiscount + taxAmt;
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

function init() {
  restoreForm();

  document.querySelectorAll("input, select").forEach((el) => {
    if (el.closest("#ratesDialog")) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

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
