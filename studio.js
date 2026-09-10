"use strict";

/* AYM Studio: clients, scope, tasks, shoot calendar.
   Data is stored in localStorage under 'aym-studio-v1'.
   Wrapped in an IIFE so helpers ($, el, uid, ...) don't collide with app.js. */

(function () {

const STORAGE_KEY = "aym-studio-v1";

const DEFAULT_STATE = {
  clients: [],
  tasks: [],
  shoots: [],
  ui: { activeClientId: null, calendarCursor: null, taskFilter: "all" },
};

const CLIENT_COLORS = [
  "#e0b265", "#6bd4a3", "#7aa2f7", "#e26b6b",
  "#c586c0", "#f5a97f", "#4dd0e1", "#a6da95",
];

const STATUS_LABEL = { active: "Active", paused: "Paused", archived: "Archived" };
const TASK_STATUS = ["todo", "doing", "done"];
const TASK_STATUS_LABEL = { todo: "To do", doing: "In progress", done: "Done" };
const PRIORITY = ["low", "med", "high"];
const PRIORITY_LABEL = { low: "Low", med: "Medium", high: "High" };

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      shoots: Array.isArray(parsed.shoots) ? parsed.shoots : [],
      ui: Object.assign({}, DEFAULT_STATE.ui, parsed.ui || {}),
    };
  } catch (_) {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) { /* quota or private mode; ignore */ }
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function pickColor() {
  const used = new Set(state.clients.map(c => c.color));
  const free = CLIENT_COLORS.find(c => !used.has(c));
  return free || CLIENT_COLORS[state.clients.length % CLIENT_COLORS.length];
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return toISO(d);
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun
  x.setDate(x.getDate() - day);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfMonth(d) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function clientById(id) {
  return state.clients.find(c => c.id === id) || null;
}

/* ------------------------------------------------------------ Rendering */

function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(node.dataset, v);
      else node.setAttribute(k, v);
    }
  }
  if (children) {
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
  }
  return node;
}

/* --- Top-level tabs ------------------------------------------ */

function initTabs() {
  const tabs = $$(".tab-nav .tab");
  tabs.forEach(t => t.addEventListener("click", () => setTab(t.dataset.tab)));
  const stored = localStorage.getItem("aym-active-tab") || "calculator";
  setTab(stored);
}

function setTab(name) {
  localStorage.setItem("aym-active-tab", name);
  $$(".tab-nav .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  if (name === "clients") renderClients();
  if (name === "tasks") renderTasks();
  if (name === "calendar") renderCalendar();
}

/* --- Clients view -------------------------------------------- */

function renderClients() {
  renderClientList();
  renderClientDetail();
}

function renderClientList() {
  const list = $("#clientList");
  list.innerHTML = "";
  if (state.clients.length === 0) {
    list.appendChild(el("div", { class: "empty" }, "No clients yet. Add one to start."));
    return;
  }
  const sorted = [...state.clients].sort((a, b) => {
    const s = statusRank(a.status) - statusRank(b.status);
    if (s !== 0) return s;
    return a.name.localeCompare(b.name);
  });
  for (const c of sorted) {
    const openCount = state.tasks.filter(t => t.clientId === c.id && t.status !== "done").length;
    const nextShoot = state.shoots
      .filter(s => s.clientId === c.id && s.date >= todayISO())
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    const row = el("div", {
      class: "client-row" + (c.id === state.ui.activeClientId ? " selected" : ""),
      onclick: () => { state.ui.activeClientId = c.id; saveState(); renderClients(); },
    }, [
      el("span", { class: "dot", style: `background:${c.color}` }),
      el("div", { class: "client-row-body" }, [
        el("div", { class: "client-row-name" }, c.name),
        el("div", { class: "client-row-meta muted" },
          `${STATUS_LABEL[c.status] || c.status} · ${openCount} open task${openCount === 1 ? "" : "s"}` +
          (nextShoot ? ` · shoot ${fmtDateShort(nextShoot.date)}` : "")
        ),
      ]),
    ]);
    list.appendChild(row);
  }
}

function statusRank(s) {
  return s === "active" ? 0 : s === "paused" ? 1 : 2;
}

function renderClientDetail() {
  const wrap = $("#clientDetail");
  wrap.innerHTML = "";
  const c = clientById(state.ui.activeClientId);
  if (!c) {
    wrap.appendChild(el("div", { class: "empty" },
      state.clients.length
        ? "Select a client on the left."
        : "Add your first client with the button above."
    ));
    return;
  }

  const openTasks = state.tasks.filter(t => t.clientId === c.id && t.status !== "done");
  const doneCount = state.tasks.filter(t => t.clientId === c.id && t.status === "done").length;
  const upcomingShoots = state.shoots
    .filter(s => s.clientId === c.id && s.date >= todayISO())
    .sort((a, b) => a.date.localeCompare(b.date));

  wrap.appendChild(el("div", { class: "detail-head" }, [
    el("div", { class: "detail-title" }, [
      el("span", { class: "dot big", style: `background:${c.color}` }),
      el("h2", { class: "no-caps" }, c.name),
    ]),
    el("div", { class: "detail-actions" }, [
      el("button", { class: "ghost", onclick: () => openClientDialog(c) }, "Edit"),
      el("button", { class: "ghost danger", onclick: () => removeClient(c.id) }, "Delete"),
    ]),
  ]));

  const meta = [];
  if (c.contact) meta.push(c.contact);
  if (c.rate) meta.push(`$${c.rate} rate`);
  meta.push(STATUS_LABEL[c.status] || c.status);
  wrap.appendChild(el("div", { class: "muted detail-meta" }, meta.join(" · ")));

  // Scope
  const scope = el("section", { class: "sub-card" }, [
    el("h3", {}, "Scope"),
    c.scope
      ? el("div", { class: "scope-text" }, c.scope)
      : el("div", { class: "muted" }, "No scope entered."),
  ]);
  wrap.appendChild(scope);

  // Weekly/monthly deliverables (structured)
  const rec = el("section", { class: "sub-card" }, [
    el("h3", {}, "Recurring deliverables"),
    renderRecurringList(c),
  ]);
  wrap.appendChild(rec);

  // This week / month task summary
  const summary = el("section", { class: "sub-card" }, [
    el("h3", {}, "At a glance"),
    el("div", { class: "chips" }, [
      chip(`${openTasks.length} open`),
      chip(`${doneCount} done`),
      chip(`${upcomingShoots.length} upcoming shoot${upcomingShoots.length === 1 ? "" : "s"}`),
      chip(`${weekTaskCount(c.id)} this week`),
      chip(`${monthTaskCount(c.id)} this month`),
    ]),
  ]);
  wrap.appendChild(summary);

  // Upcoming shoots
  const shootSec = el("section", { class: "sub-card" }, [
    el("div", { class: "row-between" }, [
      el("h3", { style: "margin:0" }, "Upcoming shoots"),
      el("button", { class: "ghost small", onclick: () => openShootDialog(null, c.id) }, "+ Add shoot"),
    ]),
    upcomingShoots.length
      ? el("ul", { class: "list" }, upcomingShoots.map(s => shootLine(s)))
      : el("div", { class: "muted" }, "No shoots scheduled."),
  ]);
  wrap.appendChild(shootSec);

  // Tasks
  const taskSec = el("section", { class: "sub-card" }, [
    el("div", { class: "row-between" }, [
      el("h3", { style: "margin:0" }, "Tasks"),
      el("button", { class: "ghost small", onclick: () => openTaskDialog(null, c.id) }, "+ Add task"),
    ]),
    openTasks.length
      ? el("ul", { class: "list" }, openTasks
          .slice()
          .sort(taskSort)
          .map(t => taskLine(t, { showClient: false })))
      : el("div", { class: "muted" }, "No open tasks."),
  ]);
  wrap.appendChild(taskSec);

  // Saved quotes for this client
  const savedQuotes = loadQuotesForClient(c.id);
  wrap.appendChild(el("section", { class: "sub-card" }, [
    el("h3", {}, "Saved quotes"),
    savedQuotes.length
      ? el("div", {}, savedQuotes.map(quoteLine))
      : el("div", { class: "muted" }, "None yet. Build one on the Calculator tab and use “Save to client”."),
  ]));

  // Notes
  if (c.notes) {
    wrap.appendChild(el("section", { class: "sub-card" }, [
      el("h3", {}, "Notes"),
      el("div", { class: "scope-text" }, c.notes),
    ]));
  }
}

function loadQuotesForClient(clientId) {
  try {
    const all = JSON.parse(localStorage.getItem("aym.quotes.v1") || "[]");
    return all
      .filter((q) => q.clientId === clientId)
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  } catch { return []; }
}

function fmtMoney(n) {
  return (n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function quoteLine(q) {
  const d = new Date(q.savedAt || Date.now());
  return el("div", { class: "quote-line" }, [
    el("div", { class: "quote-line-body" }, [
      el("div", {}, el("strong", {}, q.projectName || "Untitled quote")),
      el("div", { class: "muted small" }, d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })),
    ]),
    el("span", { class: "quote-line-total" }, fmtMoney(q.total)),
  ]);
}

function renderRecurringList(c) {
  const items = c.recurring || [];
  if (items.length === 0) return el("div", { class: "muted" }, "None. Add weekly or monthly deliverables from the client editor.");
  return el("ul", { class: "list" }, items.map(r => el("li", { class: "list-item" }, [
    el("div", {}, [
      el("strong", {}, r.title),
      el("span", { class: "badge" }, r.cadence === "weekly" ? "Weekly" : "Monthly"),
    ]),
    r.qty ? el("span", { class: "muted" }, `${r.qty}×`) : null,
  ])));
}

function chip(text) { return el("span", { class: "chip" }, text); }

function weekTaskCount(clientId) {
  const start = startOfWeek(new Date());
  const end = addDays(start, 7);
  return state.tasks.filter(t => t.clientId === clientId && t.status !== "done" && t.due &&
    t.due >= toISO(start) && t.due < toISO(end)).length;
}

function monthTaskCount(clientId) {
  const start = startOfMonth(new Date());
  const next = new Date(start); next.setMonth(next.getMonth() + 1);
  return state.tasks.filter(t => t.clientId === clientId && t.status !== "done" && t.due &&
    t.due >= toISO(start) && t.due < toISO(next)).length;
}

/* --- Tasks view ---------------------------------------------- */

function renderTasks() {
  const filter = state.ui.taskFilter || "all";
  $$("#view-tasks .filter-chip").forEach(c => c.classList.toggle("active", c.dataset.filter === filter));

  const clientSel = $("#taskClientFilter");
  if (clientSel) {
    const current = clientSel.value;
    clientSel.innerHTML = "";
    clientSel.appendChild(el("option", { value: "" }, "All clients"));
    for (const c of state.clients) clientSel.appendChild(el("option", { value: c.id }, c.name));
    clientSel.value = current || "";
  }
  const clientFilter = clientSel ? clientSel.value : "";

  const list = $("#taskList");
  list.innerHTML = "";

  const now = todayISO();
  const weekStart = toISO(startOfWeek(new Date()));
  const weekEnd = toISO(addDays(startOfWeek(new Date()), 7));
  const monthStart = toISO(startOfMonth(new Date()));
  const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthEnd = toISO(startOfMonth(nextMonth));

  const tasks = state.tasks.filter(t => {
    if (clientFilter && t.clientId !== clientFilter) return false;
    if (filter === "open") return t.status !== "done";
    if (filter === "today") return t.status !== "done" && t.due === now;
    if (filter === "overdue") return t.status !== "done" && t.due && t.due < now;
    if (filter === "week") return t.status !== "done" && t.due && t.due >= weekStart && t.due < weekEnd;
    if (filter === "month") return t.status !== "done" && t.due && t.due >= monthStart && t.due < monthEnd;
    if (filter === "done") return t.status === "done";
    return true;
  }).sort(taskSort);

  if (tasks.length === 0) {
    list.appendChild(el("div", { class: "empty" }, "No tasks match this view."));
    return;
  }

  // Group by client for readability
  const groups = new Map();
  for (const t of tasks) {
    if (!groups.has(t.clientId)) groups.set(t.clientId, []);
    groups.get(t.clientId).push(t);
  }
  for (const [cid, ts] of groups) {
    const c = clientById(cid);
    list.appendChild(el("div", { class: "task-group" }, [
      el("div", { class: "task-group-head" }, [
        el("span", { class: "dot", style: `background:${c ? c.color : "#666"}` }),
        el("strong", {}, c ? c.name : "Unassigned"),
      ]),
      el("ul", { class: "list" }, ts.map(t => taskLine(t, { showClient: false }))),
    ]));
  }
}

function taskSort(a, b) {
  const rankStatus = s => s === "doing" ? 0 : s === "todo" ? 1 : 2;
  const rs = rankStatus(a.status) - rankStatus(b.status);
  if (rs !== 0) return rs;
  const ad = a.due || "9999-12-31";
  const bd = b.due || "9999-12-31";
  if (ad !== bd) return ad.localeCompare(bd);
  const rankP = p => p === "high" ? 0 : p === "med" ? 1 : 2;
  return rankP(a.priority) - rankP(b.priority);
}

function taskLine(t, opts) {
  opts = opts || {};
  const c = clientById(t.clientId);
  const overdue = t.status !== "done" && t.due && t.due < todayISO();
  const isDone = t.status === "done";
  return el("li", { class: "task" + (isDone ? " done" : "") + (overdue ? " overdue" : "") }, [
    el("input", {
      type: "checkbox",
      checked: isDone,
      onchange: (e) => setTaskStatus(t.id, e.target.checked ? "done" : "todo"),
    }),
    el("div", { class: "task-body" }, [
      el("div", { class: "task-title" }, [
        opts.showClient && c ? el("span", { class: "dot small", style: `background:${c.color}` }) : null,
        el("span", {}, t.title),
        t.priority && t.priority !== "low" ? el("span", { class: `pri pri-${t.priority}` }, PRIORITY_LABEL[t.priority]) : null,
      ]),
      el("div", { class: "task-meta muted" }, [
        t.due ? el("span", {}, (overdue ? "Overdue · " : "Due ") + fmtDate(t.due)) : null,
        t.status === "doing" ? el("span", { class: "badge" }, "In progress") : null,
        opts.showClient && c ? el("span", {}, c.name) : null,
      ]),
    ]),
    el("div", { class: "task-actions" }, [
      el("button", { class: "icon", title: "Edit", onclick: () => openTaskDialog(t) }, "✎"),
      el("button", { class: "icon danger", title: "Delete", onclick: () => removeTask(t.id) }, "×"),
    ]),
  ]);
}

function setTaskStatus(id, status) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.status = status;
  t.updatedAt = Date.now();
  saveState();
  renderTasks();
  renderClientDetail();
}

/* --- Calendar view ------------------------------------------- */

function renderCalendar() {
  const cursor = state.ui.calendarCursor
    ? new Date(state.ui.calendarCursor + "T00:00:00")
    : startOfMonth(new Date());

  $("#calMonthLabel").textContent = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const grid = $("#calendarGrid");
  grid.innerHTML = "";

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (const w of weekdays) grid.appendChild(el("div", { class: "cal-weekday" }, w));

  const monthStart = startOfMonth(cursor);
  const firstCell = startOfWeek(monthStart);
  const today = todayISO();

  for (let i = 0; i < 42; i++) {
    const day = addDays(firstCell, i);
    const iso = toISO(day);
    const inMonth = day.getMonth() === cursor.getMonth();
    const shoots = state.shoots.filter(s => s.date === iso).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    const cell = el("div", {
      class: "cal-cell"
        + (inMonth ? "" : " other")
        + (iso === today ? " today" : ""),
      onclick: () => openShootDialog(null, null, iso),
    }, [
      el("div", { class: "cal-date" }, String(day.getDate())),
      ...shoots.map(s => {
        const c = clientById(s.clientId);
        return el("div", {
          class: "cal-shoot",
          style: `background:${c ? c.color : "#666"}22;border-left-color:${c ? c.color : "#666"}`,
          onclick: (e) => { e.stopPropagation(); openShootDialog(s); },
          title: shootTooltip(s, c),
        }, [
          s.startTime ? el("span", { class: "cal-time" }, fmtTime(s.startTime)) : null,
          el("span", { class: "cal-shoot-title" }, s.title || (c ? c.name : "Shoot")),
        ]);
      }),
    ]);
    grid.appendChild(cell);
  }

  renderUpcomingList();
}

function shootTooltip(s, c) {
  const parts = [];
  parts.push(s.title || (c ? c.name : "Shoot"));
  if (c && s.title) parts.push(`(${c.name})`);
  if (s.startTime) parts.push(fmtTime(s.startTime) + (s.endTime ? "–" + fmtTime(s.endTime) : ""));
  if (s.location) parts.push("@ " + s.location);
  return parts.join(" ");
}

function renderUpcomingList() {
  const wrap = $("#upcomingShoots");
  if (!wrap) return;
  wrap.innerHTML = "";
  const upcoming = state.shoots
    .filter(s => s.date >= todayISO())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);
  if (!upcoming.length) {
    wrap.appendChild(el("div", { class: "muted" }, "No upcoming shoots."));
    return;
  }
  const ul = el("ul", { class: "list" }, upcoming.map(shootLine));
  wrap.appendChild(ul);
}

function shootLine(s) {
  const c = clientById(s.clientId);
  return el("li", { class: "list-item", onclick: () => openShootDialog(s) }, [
    el("span", { class: "dot", style: `background:${c ? c.color : "#666"}` }),
    el("div", { class: "list-item-body" }, [
      el("div", {}, [
        el("strong", {}, s.title || (c ? c.name : "Shoot")),
        s.title && c ? el("span", { class: "muted" }, ` — ${c.name}`) : null,
      ]),
      el("div", { class: "muted small" }, [
        fmtDate(s.date),
        s.startTime ? " · " + fmtTime(s.startTime) + (s.endTime ? "–" + fmtTime(s.endTime) : "") : "",
        s.location ? " · " + s.location : "",
      ].join("")),
    ]),
    el("button", { class: "icon danger", title: "Delete", onclick: (e) => { e.stopPropagation(); removeShoot(s.id); } }, "×"),
  ]);
}

/* --- Dialogs: client, task, shoot ---------------------------- */

function openClientDialog(existing) {
  const isNew = !existing;
  const c = existing || {
    id: uid(),
    name: "",
    contact: "",
    status: "active",
    rate: "",
    scope: "",
    notes: "",
    color: pickColor(),
    recurring: [],
    createdAt: Date.now(),
  };
  const draftRec = (c.recurring || []).map(r => ({ ...r }));

  const dlg = $("#clientDialog");
  const form = $("#clientForm");
  form.reset();

  $("#c_name").value = c.name;
  $("#c_contact").value = c.contact || "";
  $("#c_status").value = c.status || "active";
  $("#c_rate").value = c.rate || "";
  $("#c_scope").value = c.scope || "";
  $("#c_notes").value = c.notes || "";
  $("#c_color").value = c.color;

  const recWrap = $("#c_recurring");
  function renderRec() {
    recWrap.innerHTML = "";
    if (draftRec.length === 0) {
      recWrap.appendChild(el("div", { class: "muted small" }, "None yet."));
    }
    draftRec.forEach((r, idx) => {
      recWrap.appendChild(el("div", { class: "rec-row" }, [
        el("input", {
          type: "text", placeholder: "e.g. 4 reels",
          value: r.title || "",
          oninput: (e) => draftRec[idx].title = e.target.value,
        }),
        el("select", {
          onchange: (e) => draftRec[idx].cadence = e.target.value,
        }, ["weekly", "monthly"].map(v => el("option", { value: v, selected: r.cadence === v }, v === "weekly" ? "Weekly" : "Monthly"))),
        el("input", {
          type: "number", min: "0", step: "1", placeholder: "Qty",
          value: r.qty || "",
          oninput: (e) => draftRec[idx].qty = Number(e.target.value) || 0,
        }),
        el("button", {
          type: "button", class: "icon danger",
          onclick: () => { draftRec.splice(idx, 1); renderRec(); },
        }, "×"),
      ]));
    });
  }
  renderRec();

  $("#c_addRecurring").onclick = () => {
    draftRec.push({ title: "", cadence: "weekly", qty: 1 });
    renderRec();
  };

  form.onsubmit = (e) => {
    if (e.submitter && e.submitter.value === "cancel") return;
    e.preventDefault();
    c.name = $("#c_name").value.trim() || "Untitled client";
    c.contact = $("#c_contact").value.trim();
    c.status = $("#c_status").value;
    const rateNum = Number($("#c_rate").value);
    c.rate = Number.isFinite(rateNum) && rateNum > 0 ? rateNum : "";
    c.scope = $("#c_scope").value.trim();
    c.notes = $("#c_notes").value.trim();
    c.color = $("#c_color").value;
    c.recurring = draftRec.filter(r => (r.title || "").trim().length > 0);
    c.updatedAt = Date.now();

    if (isNew) state.clients.push(c);
    state.ui.activeClientId = c.id;
    saveState();
    dlg.close();
    renderClients();
  };

  dlg.showModal();
}

function removeClient(id) {
  const c = clientById(id);
  if (!c) return;
  const openCount = state.tasks.filter(t => t.clientId === id && t.status !== "done").length;
  const shootCount = state.shoots.filter(s => s.clientId === id).length;
  const msg = `Delete "${c.name}"?` +
    (openCount || shootCount
      ? `\n\nThis will also remove ${openCount} open task(s) and ${shootCount} shoot(s).`
      : "");
  if (!confirm(msg)) return;
  state.clients = state.clients.filter(x => x.id !== id);
  state.tasks = state.tasks.filter(t => t.clientId !== id);
  state.shoots = state.shoots.filter(s => s.clientId !== id);
  if (state.ui.activeClientId === id) state.ui.activeClientId = state.clients[0]?.id || null;
  saveState();
  renderClients();
}

function openTaskDialog(existing, presetClientId) {
  const isNew = !existing;
  const t = existing || {
    id: uid(),
    clientId: presetClientId || state.ui.activeClientId || (state.clients[0] && state.clients[0].id) || "",
    title: "",
    notes: "",
    due: "",
    priority: "med",
    status: "todo",
    createdAt: Date.now(),
  };

  const dlg = $("#taskDialog");
  const form = $("#taskForm");
  form.reset();

  const clientSel = $("#t_client");
  clientSel.innerHTML = "";
  clientSel.appendChild(el("option", { value: "" }, "— No client —"));
  for (const c of state.clients) clientSel.appendChild(el("option", { value: c.id }, c.name));
  clientSel.value = t.clientId || "";

  $("#t_title").value = t.title;
  $("#t_notes").value = t.notes || "";
  $("#t_due").value = t.due || "";
  $("#t_priority").value = t.priority || "med";
  $("#t_status").value = t.status || "todo";

  form.onsubmit = (e) => {
    if (e.submitter && e.submitter.value === "cancel") return;
    if (e.submitter && e.submitter.value === "delete") {
      e.preventDefault();
      if (!confirm("Delete this task?")) return;
      state.tasks = state.tasks.filter(x => x.id !== t.id);
      saveState();
      dlg.close();
      renderTasks();
      renderClientDetail();
      return;
    }
    e.preventDefault();
    t.clientId = clientSel.value;
    t.title = $("#t_title").value.trim() || "Untitled task";
    t.notes = $("#t_notes").value.trim();
    t.due = $("#t_due").value || "";
    t.priority = $("#t_priority").value;
    t.status = $("#t_status").value;
    t.updatedAt = Date.now();

    if (isNew) state.tasks.push(t);
    saveState();
    dlg.close();
    renderTasks();
    renderClientDetail();
  };

  $("#t_delete").style.display = isNew ? "none" : "";
  dlg.showModal();
}

function removeTask(id) {
  if (!confirm("Delete this task?")) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveState();
  renderTasks();
  renderClientDetail();
}

function openShootDialog(existing, presetClientId, presetDate) {
  const isNew = !existing;
  const s = existing || {
    id: uid(),
    clientId: presetClientId || state.ui.activeClientId || (state.clients[0] && state.clients[0].id) || "",
    title: "",
    date: presetDate || todayISO(),
    startTime: "",
    endTime: "",
    location: "",
    notes: "",
    createdAt: Date.now(),
  };

  const dlg = $("#shootDialog");
  const form = $("#shootForm");
  form.reset();

  const clientSel = $("#s_client");
  clientSel.innerHTML = "";
  clientSel.appendChild(el("option", { value: "" }, "— No client —"));
  for (const c of state.clients) clientSel.appendChild(el("option", { value: c.id }, c.name));
  clientSel.value = s.clientId || "";

  $("#s_title").value = s.title || "";
  $("#s_date").value = s.date;
  $("#s_start").value = s.startTime || "";
  $("#s_end").value = s.endTime || "";
  $("#s_location").value = s.location || "";
  $("#s_notes").value = s.notes || "";

  form.onsubmit = (e) => {
    if (e.submitter && e.submitter.value === "cancel") return;
    if (e.submitter && e.submitter.value === "delete") {
      e.preventDefault();
      if (!confirm("Delete this shoot day?")) return;
      state.shoots = state.shoots.filter(x => x.id !== s.id);
      saveState();
      dlg.close();
      renderCalendar();
      renderClientDetail();
      return;
    }
    e.preventDefault();
    s.clientId = clientSel.value;
    s.title = $("#s_title").value.trim();
    s.date = $("#s_date").value || todayISO();
    s.startTime = $("#s_start").value;
    s.endTime = $("#s_end").value;
    s.location = $("#s_location").value.trim();
    s.notes = $("#s_notes").value.trim();
    s.updatedAt = Date.now();

    if (isNew) state.shoots.push(s);
    saveState();
    dlg.close();
    renderCalendar();
    renderClientDetail();
  };

  $("#s_delete").style.display = isNew ? "none" : "";
  dlg.showModal();
}

function removeShoot(id) {
  if (!confirm("Delete this shoot day?")) return;
  state.shoots = state.shoots.filter(s => s.id !== id);
  saveState();
  renderCalendar();
  renderClientDetail();
}

/* --- Wire buttons -------------------------------------------- */

function initTheme() {
  const stored = localStorage.getItem("aym-theme"); // "light" | "dark" | null
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  }
  updateThemeToggle();

  const btn = $("#themeToggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const current = currentTheme();
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("aym-theme", next);
    updateThemeToggle();
  });
}

function currentTheme() {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark" : "light";
}

function updateThemeToggle() {
  const btn = $("#themeToggle");
  if (!btn) return;
  const t = currentTheme();
  const icon = btn.querySelector(".theme-icon");
  if (icon) icon.textContent = t === "dark" ? "☀" : "☾";
  btn.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Only register when served over http(s); file:// won't work.
  if (location.protocol !== "http:" && location.protocol !== "https:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

const EXPORT_KEYS = [
  "aym-studio-v1",
  "aym.rates.v1",
  "aym.form.v1",
  "aym.presets.v1",
  "aym.quotes.v1",
  "aym-theme",
  "aym-active-tab",
];

function exportAllData() {
  const data = {};
  for (const k of EXPORT_KEYS) {
    const raw = localStorage.getItem(k);
    if (raw != null) data[k] = raw;
  }
  const payload = {
    app: "aym-studio",
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `aym-studio-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importAllData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || parsed.app !== "aym-studio" || !parsed.data) {
        alert("This file doesn't look like an AYM Studio export.");
        return;
      }
      if (!confirm("Replace all current data with this file? This can't be undone.")) return;
      for (const k of EXPORT_KEYS) localStorage.removeItem(k);
      for (const [k, v] of Object.entries(parsed.data)) {
        if (typeof v === "string") localStorage.setItem(k, v);
      }
      location.reload();
    } catch (e) {
      alert("Could not read that file.");
    }
  };
  reader.readAsText(file);
}

function initStudio() {
  initTheme();
  registerServiceWorker();
  initTabs();

  $("#addClient").addEventListener("click", () => openClientDialog(null));
  $("#addTask").addEventListener("click", () => openTaskDialog(null));
  $("#addShoot").addEventListener("click", () => openShootDialog(null));

  $$("#view-tasks .filter-chip").forEach(c => {
    c.addEventListener("click", () => {
      state.ui.taskFilter = c.dataset.filter;
      saveState();
      renderTasks();
    });
  });

  const clientSel = $("#taskClientFilter");
  if (clientSel) clientSel.addEventListener("change", renderTasks);

  $("#calPrev").addEventListener("click", () => shiftMonth(-1));
  $("#calNext").addEventListener("click", () => shiftMonth(1));
  $("#calToday").addEventListener("click", () => {
    state.ui.calendarCursor = toISO(startOfMonth(new Date()));
    saveState();
    renderCalendar();
  });

  const seed = $("#seedDemo");
  if (seed) seed.addEventListener("click", seedDemoData);

  const exportBtn = $("#exportData");
  if (exportBtn) exportBtn.addEventListener("click", exportAllData);

  const importBtn = $("#importData");
  const importFile = $("#importFile");
  if (importBtn && importFile) {
    importBtn.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importAllData(f);
      importFile.value = "";
    });
  }
}

function shiftMonth(delta) {
  const cur = state.ui.calendarCursor
    ? new Date(state.ui.calendarCursor + "T00:00:00")
    : startOfMonth(new Date());
  cur.setMonth(cur.getMonth() + delta);
  state.ui.calendarCursor = toISO(startOfMonth(cur));
  saveState();
  renderCalendar();
}

function seedDemoData() {
  if (state.clients.length && !confirm("Replace existing studio data with demo data?")) return;
  state.clients = [];
  state.tasks = [];
  state.shoots = [];
  const c1 = { id: uid(), name: "Northside Cafe", contact: "hana@northside.co", status: "active",
    rate: 1500, color: "#e0b265",
    scope: "Monthly social content: 8 short-form videos + 12 stills. Quarterly brand campaign.",
    notes: "", recurring: [{ title: "Short-form video", cadence: "monthly", qty: 8 }, { title: "Story photo", cadence: "weekly", qty: 3 }], createdAt: Date.now() };
  const c2 = { id: uid(), name: "Ridgeway Realty", contact: "mark@ridgeway.re", status: "active",
    rate: 950, color: "#6bd4a3",
    scope: "Listing walkthroughs: 2 per week, edited within 48h. Drone included.",
    notes: "", recurring: [{ title: "Listing walkthrough", cadence: "weekly", qty: 2 }], createdAt: Date.now() };
  state.clients.push(c1, c2);
  const t = todayISO();
  const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return toISO(d); };
  state.tasks.push(
    { id: uid(), clientId: c1.id, title: "Storyboard July reels", due: inDays(2), priority: "high", status: "doing", createdAt: Date.now() },
    { id: uid(), clientId: c1.id, title: "Deliver 4 stills for Friday post", due: inDays(4), priority: "med", status: "todo", createdAt: Date.now() },
    { id: uid(), clientId: c2.id, title: "Edit Elm St walkthrough", due: inDays(1), priority: "high", status: "todo", createdAt: Date.now() },
    { id: uid(), clientId: c2.id, title: "Send invoice for June", due: inDays(-1), priority: "med", status: "todo", createdAt: Date.now() },
  );
  state.shoots.push(
    { id: uid(), clientId: c1.id, title: "Cafe menu shoot", date: inDays(3), startTime: "09:00", endTime: "13:00", location: "Northside Cafe", createdAt: Date.now() },
    { id: uid(), clientId: c2.id, title: "Elm St walkthrough", date: inDays(1), startTime: "14:00", endTime: "16:00", location: "412 Elm St", createdAt: Date.now() },
    { id: uid(), clientId: c2.id, title: "Oak Ave walkthrough", date: inDays(8), startTime: "10:00", endTime: "12:00", location: "88 Oak Ave", createdAt: Date.now() },
  );
  state.ui.activeClientId = c1.id;
  saveState();
  renderClients();
  renderTasks();
  renderCalendar();
}

document.addEventListener("DOMContentLoaded", initStudio);

})();
