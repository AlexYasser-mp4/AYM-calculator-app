"use strict";

/* AYM Studio: cross-device sync via Supabase.
   - Supabase URL + anon key are safe to ship in client code (RLS
     confines each user's rows to their auth.uid()).
   - On sign-in, we pull the remote blob first; if it exists we replace
     local state with it, otherwise we push local up as the initial
     state. After first-sync, any local write is debounced and pushed,
     and any remote change (from another device) arrives via Realtime
     and re-hydrates local. */

(function () {

const SUPABASE_URL = "https://fyafdjtsyqahctkifweb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5YWZkanRzeXFhaGN0a2lmd2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNDc2NjcsImV4cCI6MjEwNDYyMzY2N30.HMuZjMNgv3_Ybpbsx94XUE4Be8TvMxefNNysNEdWmLo";

const SYNC_KEYS = [
  "aym-studio-v1",
  "aym.rates.v1",
  "aym.form.v1",
  "aym.presets.v1",
  "aym.quotes.v1",
];

let client = null;
let session = null;
let syncEnabled = false;
let applyingRemote = false;
let pushTimer = null;
let lastPushedAt = null;
let realtimeChan = null;

function $(id) { return document.getElementById(id); }

function getClient() {
  if (client) return client;
  if (!window.supabase || !window.supabase.createClient) return null;
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "aym.sync.auth" },
  });
  return client;
}

function snapshot() {
  const data = {};
  for (const k of SYNC_KEYS) {
    const raw = localStorage.getItem(k);
    if (raw != null) data[k] = raw;
  }
  return data;
}

function applySnapshot(data) {
  applyingRemote = true;
  try {
    for (const k of SYNC_KEYS) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(data || {})) {
      if (typeof v === "string") localStorage.setItem(k, v);
    }
  } finally {
    applyingRemote = false;
  }
}

function debouncedPush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushState, 800);
}

async function pushState() {
  const supa = getClient();
  if (!supa || !session) return;
  const now = new Date().toISOString();
  lastPushedAt = now;
  setStatus("syncing");
  const { error } = await supa.from("app_state").upsert({
    user_id: session.user.id,
    data: snapshot(),
    updated_at: now,
  }, { onConflict: "user_id" });
  setStatus(error ? "error" : "ok", error && error.message);
}

async function pullState() {
  const supa = getClient();
  if (!supa || !session) return null;
  const { data, error } = await supa.from("app_state")
    .select("data,updated_at")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) return null;
  return data;
}

function patchStorage() {
  const origSet = Storage.prototype.setItem;
  const origRemove = Storage.prototype.removeItem;
  localStorage.setItem = function (k, v) {
    origSet.call(localStorage, k, v);
    if (!syncEnabled || applyingRemote) return;
    if (SYNC_KEYS.includes(k)) debouncedPush();
  };
  localStorage.removeItem = function (k) {
    origRemove.call(localStorage, k);
    if (!syncEnabled || applyingRemote) return;
    if (SYNC_KEYS.includes(k)) debouncedPush();
  };
}

async function firstSyncAfterLogin() {
  const remote = await pullState();
  const local = snapshot();
  const localHasData = Object.keys(local).length > 0;
  const remoteHasData = remote && remote.data && Object.keys(remote.data).length > 0;

  if (remoteHasData) {
    // Overwrite local with remote and reload so all views re-render.
    applySnapshot(remote.data);
    syncEnabled = true;
    subscribeRealtime();
    // Only reload if the incoming data actually differs.
    if (JSON.stringify(local) !== JSON.stringify(remote.data)) {
      location.reload();
      return;
    }
  } else if (localHasData) {
    // First device — seed remote with what we have.
    syncEnabled = true;
    await pushState();
    subscribeRealtime();
  } else {
    // Nothing anywhere yet.
    syncEnabled = true;
    subscribeRealtime();
  }
  setStatus("ok");
}

function subscribeRealtime() {
  const supa = getClient();
  if (!supa || !session) return;
  if (realtimeChan) supa.removeChannel(realtimeChan);
  realtimeChan = supa
    .channel("app_state:" + session.user.id)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_state", filter: "user_id=eq." + session.user.id },
      (payload) => {
        const row = payload.new;
        if (!row || !row.data) return;
        if (row.updated_at === lastPushedAt) return; // echo of our own push
        applySnapshot(row.data);
        location.reload();
      }
    )
    .subscribe();
}

function setStatus(state, message) {
  const btn = $("syncToggle");
  if (!btn) return;
  btn.dataset.syncState = state;
  const icon = btn.querySelector(".sync-icon");
  if (icon) icon.textContent = state === "syncing" ? "↻" : (state === "error" ? "!" : (session ? "☁" : "☁"));
  const email = session && session.user && session.user.email;
  btn.title = !session
    ? "Sign in to sync across devices"
    : (state === "error" ? "Sync error: " + (message || "") : "Signed in: " + email + (state === "syncing" ? " · syncing…" : " · synced"));
}

/* --- Sync dialog UI --- */

function openSyncDialog() {
  const dlg = $("syncDialog");
  const msg = $("syncMsg");
  msg.textContent = "";
  if (session) {
    $("syncSignedInBlock").hidden = false;
    $("syncSignedOutBlock").hidden = true;
    $("syncEmail").textContent = session.user.email;
  } else {
    $("syncSignedInBlock").hidden = true;
    $("syncSignedOutBlock").hidden = false;
  }
  dlg.showModal();
}

function bindSyncUI() {
  const btn = $("syncToggle");
  if (btn) btn.addEventListener("click", openSyncDialog);

  const form = $("syncForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    if (!e.submitter) return;
    const action = e.submitter.value;
    const msg = $("syncMsg");
    if (action === "cancel" || action === "close") return;

    e.preventDefault();
    const email = $("syncEmailInput").value.trim();
    const password = $("syncPasswordInput").value;
    const supa = getClient();
    if (!supa) { msg.textContent = "Sync SDK failed to load."; return; }
    msg.textContent = "";

    if (action === "signin") {
      const { error } = await supa.auth.signInWithPassword({ email, password });
      if (error) { msg.textContent = error.message; return; }
      $("syncDialog").close();
    } else if (action === "signup") {
      const { error } = await supa.auth.signUp({ email, password });
      if (error) { msg.textContent = error.message; return; }
      msg.textContent = "Account created. If email confirmation is on, click the link in your inbox, then sign in.";
    } else if (action === "signout") {
      await supa.auth.signOut();
      $("syncDialog").close();
      location.reload();
    }
  });
}

async function initSync() {
  patchStorage();
  bindSyncUI();

  // Wait briefly for the Supabase SDK to load.
  for (let i = 0; i < 40 && (!window.supabase || !window.supabase.createClient); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const supa = getClient();
  if (!supa) {
    setStatus("error", "SDK unavailable");
    return;
  }

  const { data } = await supa.auth.getSession();
  session = data.session || null;
  setStatus(session ? "ok" : "off");

  supa.auth.onAuthStateChange(async (event, s) => {
    session = s || null;
    setStatus(session ? "ok" : "off");
    if (event === "SIGNED_IN" && session) {
      await firstSyncAfterLogin();
    }
    if (event === "SIGNED_OUT") {
      syncEnabled = false;
      if (realtimeChan) { supa.removeChannel(realtimeChan); realtimeChan = null; }
    }
  });

  if (session) await firstSyncAfterLogin();
}

document.addEventListener("DOMContentLoaded", initSync);

})();
