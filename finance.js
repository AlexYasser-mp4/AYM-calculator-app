"use strict";

const STORAGE_KEY = "aym.income.2026.v1";
const YEAR = 2026;

const CATEGORY_LABELS = {
  wedding: "Wedding",
  event: "Event / Conference",
  corporate: "Corporate / Brand",
  commercial: "Commercial / Promo",
  musicVideo: "Music Video",
  realEstate: "Real Estate",
  socialContent: "Social Media Content",
  documentary: "Documentary / Interview",
  licensing: "Licensing / Royalties",
  other: "Other",
};

const MONTH_LABELS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function loadEntries() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

let entries = loadEntries();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function parseEntryDate(iso) {
  // Treat ISO date string as local to avoid TZ off-by-one.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function entryYear(e) {
  return parseEntryDate(e.date).getFullYear();
}

function entryMonth(e) {
  return parseEntryDate(e.date).getMonth();
}

function resetForm() {
  $("entryForm").reset();
  $("entryId").value = "";
  $("entryDate").value = todayInYear();
  $("saveEntry").textContent = "Add entry";
  $("cancelEdit").hidden = true;
}

function todayInYear() {
  const now = new Date();
  if (now.getFullYear() === YEAR) return now.toISOString().slice(0, 10);
  return `${YEAR}-01-01`;
}

function loadEntryIntoForm(id) {
  const e = entries.find((x) => x.id === id);
  if (!e) return;
  $("entryId").value = e.id;
  $("entryDate").value = e.date;
  $("entryAmount").value = e.amount;
  $("entrySource").value = e.source;
  $("entryCategory").value = e.category;
  $("entryStatus").value = e.status;
  $("entryNotes").value = e.notes || "";
  $("saveEntry").textContent = "Update entry";
  $("cancelEdit").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleSubmit(e) {
  e.preventDefault();
  const id = $("entryId").value || uid();
  const data = {
    id,
    date: $("entryDate").value,
    amount: +$("entryAmount").value || 0,
    source: $("entrySource").value.trim(),
    category: $("entryCategory").value,
    status: $("entryStatus").value,
    notes: $("entryNotes").value.trim(),
  };
  if (!data.date || !data.source || data.amount <= 0) return;

  const idx = entries.findIndex((x) => x.id === id);
  if (idx >= 0) entries[idx] = data;
  else entries.push(data);

  saveEntries(entries);
  resetForm();
  render();
}

function deleteEntry(id) {
  if (!confirm("Delete this entry?")) return;
  entries = entries.filter((e) => e.id !== id);
  saveEntries(entries);
  render();
}

function getFilters() {
  return {
    month: $("filterMonth").value,
    status: $("filterStatus").value,
  };
}

function applyFilters(list) {
  const f = getFilters();
  return list.filter((e) => {
    if (entryYear(e) !== YEAR) return false;
    if (f.month !== "all" && entryMonth(e) !== +f.month) return false;
    if (f.status !== "all" && e.status !== f.status) return false;
    return true;
  });
}

function renderEntries() {
  const filtered = applyFilters(entries).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  );
  const tbody = $("entriesBody");
  tbody.innerHTML = "";

  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="7" class="empty-row">No entries match this filter.</td>`;
    tbody.appendChild(tr);
  } else {
    for (const e of filtered) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(e.date)}</td>
        <td>${escapeHtml(e.source)}</td>
        <td>${escapeHtml(CATEGORY_LABELS[e.category] || e.category)}</td>
        <td><span class="pill pill-${e.status}">${e.status}</span></td>
        <td class="num">${fmt(e.amount)}</td>
        <td class="notes-col">${escapeHtml(e.notes || "")}</td>
        <td class="row-actions">
          <button type="button" class="link" data-edit="${e.id}">Edit</button>
          <button type="button" class="link danger" data-del="${e.id}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    }
  }

  $("entriesCount").textContent =
    `${filtered.length} entr${filtered.length === 1 ? "y" : "ies"}`;

  tbody.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => loadEntryIntoForm(b.dataset.edit))
  );
  tbody.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteEntry(b.dataset.del))
  );
}

function renderTotals() {
  const yearly = entries.filter((e) => entryYear(e) === YEAR);
  const paid = yearly.filter((e) => e.status === "paid");
  const pending = yearly.filter((e) => e.status === "pending");

  const sum = (arr) => arr.reduce((s, e) => s + (+e.amount || 0), 0);
  const paidTotal = sum(paid);
  const pendingTotal = sum(pending);

  $("kpiPaid").textContent = fmt(paidTotal);
  $("kpiPending").textContent = fmt(pendingTotal);
  $("kpiProjected").textContent = fmt(paidTotal + pendingTotal);
  $("kpiCount").textContent = String(yearly.length);

  // Monthly bars (paid only)
  const monthly = Array(12).fill(0);
  paid.forEach((e) => { monthly[entryMonth(e)] += +e.amount || 0; });
  const monthMax = Math.max(...monthly, 1);

  const monthlyList = $("monthlyList");
  monthlyList.innerHTML = "";
  monthly.forEach((amt, i) => {
    const li = document.createElement("li");
    const pct = (amt / monthMax) * 100;
    li.innerHTML = `
      <span class="bar-label">${MONTH_LABELS[i]}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
      <span class="bar-amt">${amt > 0 ? fmt(amt) : "—"}</span>`;
    monthlyList.appendChild(li);
  });

  // Category breakdown (paid only)
  const byCat = {};
  paid.forEach((e) => {
    byCat[e.category] = (byCat[e.category] || 0) + (+e.amount || 0);
  });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const catMax = Math.max(...catEntries.map(([, v]) => v), 1);

  const categoryList = $("categoryList");
  categoryList.innerHTML = "";
  if (catEntries.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No paid income yet.";
    categoryList.appendChild(li);
  } else {
    catEntries.forEach(([key, amt]) => {
      const li = document.createElement("li");
      const pct = (amt / catMax) * 100;
      li.innerHTML = `
        <span class="bar-label">${escapeHtml(CATEGORY_LABELS[key] || key)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
        <span class="bar-amt">${fmt(amt)}</span>`;
      categoryList.appendChild(li);
    });
  }
}

function render() {
  renderTotals();
  renderEntries();
}

function formatDate(iso) {
  const d = parseEntryDate(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// CSV
function exportCsv() {
  const header = ["date","source","category","status","amount","notes"];
  const rows = entries
    .filter((e) => entryYear(e) === YEAR)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) => header.map((k) => csvCell(e[k])).join(","));
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aym-income-${YEAR}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length && r.some((x) => x !== ""));
}

function importCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCsv(String(reader.result));
    if (rows.length < 2) return alert("CSV is empty.");
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const required = ["date","source","category","status","amount"];
    if (!required.every((r) => header.includes(r))) {
      return alert(`CSV must have columns: ${required.join(", ")}`);
    }
    let added = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const get = (k) => r[header.indexOf(k)] ?? "";
      const amount = parseFloat(get("amount"));
      if (!get("date") || !get("source") || !(amount > 0)) continue;
      entries.push({
        id: uid(),
        date: get("date"),
        source: get("source"),
        category: CATEGORY_LABELS[get("category")] ? get("category") : "other",
        status: get("status") === "pending" ? "pending" : "paid",
        amount,
        notes: get("notes") || "",
      });
      added++;
    }
    saveEntries(entries);
    render();
    alert(`Imported ${added} entr${added === 1 ? "y" : "ies"}.`);
  };
  reader.readAsText(file);
}

function init() {
  $("entryDate").value = todayInYear();

  $("entryForm").addEventListener("submit", handleSubmit);
  $("cancelEdit").addEventListener("click", resetForm);

  $("filterMonth").addEventListener("change", renderEntries);
  $("filterStatus").addEventListener("change", renderEntries);

  $("exportCsv").addEventListener("click", exportCsv);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importCsv(file);
    e.target.value = "";
  });

  $("clearAll").addEventListener("click", () => {
    if (!confirm(`Delete ALL ${YEAR} income entries? This cannot be undone.`)) return;
    entries = entries.filter((e) => entryYear(e) !== YEAR);
    saveEntries(entries);
    render();
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
