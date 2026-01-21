/**
 * app.js - Vollständige Logik für Berichtsheft Pro
 * Optimierte Version zur Vermeidung von 404-Log-Fehlern und Verbindungsabbrüchen.
 * Enthält Fehler-Resilienz gegen Browser-Extension-Konflikte.
 */

// --- KONFIGURATION ---
const SUPABASE_URL = "https://epeqhchtatxgninetvid.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZXFoY2h0YXR4Z25pbmV0dmlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTIyNTIsImV4cCI6MjA4NDQyODI1Mn0.5yNc888ypwrAcUGvSZM8CfssRMbcovBFyltkSx6fErA";

let supabaseClient = null;

// Robuste Initialisierung des Clients
function initSupabase() {
  try {
    if (window.supabase) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
      console.warn("Supabase CDN noch nicht bereit, warte kurz...");
      setTimeout(initSupabase, 500);
    }
  } catch (e) {
    console.error("Kritischer Initialisierungsfehler:", e);
  }
}

// --- STATE & KEYS ---
let currentUser = null;
const KEY = {
  setup: "setupDone",
  subjects: "subjects",
  days: "schoolDays",
  school: "schoolEntries",
  work: "workEntries",
  dark: "darkMode",
  workTemplates: "workTemplates"
};

const state = {
  selectedDate: new Date().toISOString().split("T")[0],
  weekOff: 0
};

// --- HILFSFUNKTIONEN ---
const $ = (id) => document.getElementById(id);
const hide = (el) => el && el.classList.add("hidden");
const show = (el) => el && el.classList.remove("hidden");
const getData = (k, fb) => {
  try {
    const item = localStorage.getItem(k);
    return item ? JSON.parse(item) : fb;
  } catch (e) { return fb; }
};
const setData = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const esc = (t) => { 
  if (!t) return "";
  const d = document.createElement("div"); 
  d.textContent = t; 
  return d.innerHTML; 
};

// --- AUTHENTIFIZIERUNG ---
async function initAuth() {
  if (!supabaseClient) return;
  
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    handleUser(session?.user || null);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      handleUser(session?.user || null);
    });
  } catch (err) {
    console.log("Session-Check übersprungen oder offline.");
  }
}

function handleUser(user) {
  currentUser = user;
  if (!user) {
    show($("login-screen"));
    hide($("setup-screen"));
    hide($("app-screen"));
  } else {
    hide($("login-screen"));
    // Erst schauen ob Cloud-Daten da sind, dann entscheiden ob Setup oder App
    syncDown().finally(() => {
      if (!getData(KEY.setup, false)) {
        show($("setup-screen"));
        renderSetup();
      } else {
        show($("app-screen"));
        renderAll();
        switchTab("day");
      }
    });
  }
}

// --- INITIALISIERUNG ---
document.addEventListener("DOMContentLoaded", () => {
  initSupabase();
  initAuth();
  applyTheme();

  // Login Events
  if ($("login-btn")) {
    $("login-btn").onclick = async () => {
      const email = $("login-email").value;
      const password = $("login-pass").value;
      if(!email || !password) return;
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) console.error(error.message);
    };
  }

  if ($("signup-btn")) {
    $("signup-btn").onclick = async () => {
      const email = $("login-email").value;
      const password = $("login-pass").value;
      if(!email || !password) return;
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) console.error(error.message);
    };
  }

  // Navigation Tabs
  document.querySelectorAll(".tabbtn").forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  // Date Picker Logic
  const dateDisplay = $("date-display");
  const dateInput = $("hidden-date-input");
  if (dateDisplay && dateInput) {
    dateDisplay.onclick = () => dateInput.showPicker();
    dateInput.onchange = (e) => {
      state.selectedDate = e.target.value;
      renderAll();
      updateTopbar();
    };
  }

  // Setup Schritte
  if ($("setup-to-step-2")) $("setup-to-step-2").onclick = () => { hide($("setup-step-1")); show($("setup-step-2")); };
  if ($("setup-to-step-3")) $("setup-to-step-3").onclick = () => { hide($("setup-step-2")); show($("setup-step-3")); renderSetupTemplates(); };

  if ($("setup-add-subject")) {
    $("setup-add-subject").onclick = () => {
      const v = $("setup-subject-input").value.trim();
      if (v) {
        const s = getData(KEY.subjects, []);
        s.push(v);
        setData(KEY.subjects, s);
        $("setup-subject-input").value = "";
        renderSetup();
      }
    };
  }

  if ($("setup-finish")) {
    $("setup-finish").onclick = async () => {
      setData(KEY.setup, true);
      await saveConfig();
      location.reload();
    };
  }

  if ($("logout-btn")) {
    $("logout-btn").onclick = async () => {
      await supabaseClient.auth.signOut();
      localStorage.clear();
      location.reload();
    };
  }

  if ($("report-prev")) $("report-prev").onclick = () => { state.weekOff--; renderReport(); };
  if ($("report-next")) $("report-next").onclick = () => { state.weekOff++; renderReport(); };
});

// --- CLOUD SYNC ---
async function saveEntry() {
  if (!currentUser || !supabaseClient) return;
  const day = state.selectedDate;
  try {
    // Upsert ohne Rückmeldung für flüssiges Tippen
    await supabaseClient.from("day_entries").upsert({
      user_id: currentUser.id,
      day: day,
      school: getData(KEY.school, {})[day] || {},
      work: getData(KEY.work, {})[day] || { tasks: [], note: "" }
    }, { onConflict: 'user_id, day' });
  } catch (e) {}
}

async function saveConfig() {
  if (!currentUser || !supabaseClient) return;
  try {
    await supabaseClient.from("user_configs").upsert({
      user_id: currentUser.id,
      subjects: getData(KEY.subjects, []),
      schooldays: getData(KEY.days, [1, 2]),
      templates: getData(KEY.workTemplates, {})
    }, { onConflict: 'user_id' });
  } catch (e) {}
}

async function syncDown() {
  if (!currentUser || !supabaseClient) return;
  
  try {
    // 1. Einträge parallel laden
    const [entriesRes, configRes] = await Promise.all([
      supabaseClient.from("day_entries").select("*").eq("user_id", currentUser.id),
      supabaseClient.from("user_configs").select("*").eq("user_id", currentUser.id).maybeSingle()
    ]);

    if (entriesRes.data && entriesRes.data.length > 0) {
      const s = getData(KEY.school, {}); 
      const w = getData(KEY.work, {});
      entriesRes.data.forEach(e => { s[e.day] = e.school; w[e.day] = e.work; });
      setData(KEY.school, s); 
      setData(KEY.work, w);
    }
    
    if (configRes.data) {
      const c = configRes.data;
      setData(KEY.subjects, c.subjects || []);
      setData(KEY.days, c.schooldays || [1, 2]);
      setData(KEY.workTemplates, c.templates || {});
      if (c.subjects && c.subjects.length > 0) setData(KEY.setup, true);
    }
  } catch (e) {
    console.log("Sync Hinweis: Cloud aktuell nicht erreichbar oder leer.");
  }
}

// --- UI RENDERING ---
function applyTheme() {
  const dark = getData(KEY.dark, true);
  document.body.classList.toggle("light", !dark);
}

function updateTopbar() {
  const d = new Date(state.selectedDate);
  const opt = { weekday: 'short', day: '2-digit', month: '2-digit' };
  if ($("date-display")) $("date-display").textContent = d.toLocaleDateString('de-DE', opt);
}

function switchTab(t) {
  document.querySelectorAll(".tab-content").forEach(c => hide(c));
  const target = $("tab-" + t);
  if (target) show(target);
  document.querySelectorAll(".tabbtn").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  if (t === "report") renderReport();
  if (t === "day") renderAll();
  updateTopbar();
}

function renderAll() {
  renderSchool();
  renderWork();
}

function isSchoolDay() {
  const d = new Date(state.selectedDate).getDay();
  return getData(KEY.days, [1, 2]).includes(d);
}

function renderSchool() {
  const list = $("school-list");
  if (!list) return;
  list.innerHTML = "";
  if (!isSchoolDay()) {
    list.innerHTML = "<div class='panel muted' style='text-align:center'>Kein Schultag laut Einstellungen.</div>";
    return;
  }
  const entries = getData(KEY.school, {});
  const dayData = entries[state.selectedDate] || {};
  getData(KEY.subjects, []).forEach(sub => {
    const card = document.createElement("div");
    card.className = "panel";
    card.innerHTML = `<div class="h3">${esc(sub)}</div><textarea class="input" style="min-height:80px" placeholder="Inhalt...">${esc(dayData[sub] || "")}</textarea>`;
    card.querySelector("textarea").oninput = (e) => {
      dayData[sub] = e.target.value;
      entries[state.selectedDate] = dayData;
      setData(KEY.school, entries);
      saveEntry();
    };
    list.appendChild(card);
  });
}

function renderWork() {
  const list = $("work-list");
  if (!list) return;
  list.innerHTML = "";
  if (isSchoolDay()) {
    list.innerHTML = "<div class='panel muted' style='text-align:center'>Heute ist Berufsschule.</div>";
    return;
  }
  const entries = getData(KEY.work, {});
  const dayData = entries[state.selectedDate] || { tasks: [], note: "" };
  const temps = getData(KEY.workTemplates, {});

  Object.keys(temps).forEach(cat => {
    const card = document.createElement("div");
    card.className = "panel";
    card.innerHTML = `<div class="h3">${esc(cat)}</div><div class="chip-container"></div>`;
    const cont = card.querySelector(".chip-container");
    (temps[cat] || []).forEach(t => {
      const chip = document.createElement("div");
      chip.className = "chip" + (dayData.tasks.includes(t) ? " active" : "");
      chip.textContent = t;
      chip.onclick = () => {
        dayData.tasks = dayData.tasks.includes(t) ? dayData.tasks.filter(x => x !== t) : [...dayData.tasks, t];
        entries[state.selectedDate] = dayData;
        setData(KEY.work, entries);
        renderWork();
        saveEntry();
      };
      cont.appendChild(chip);
    });
    list.appendChild(card);
  });
  
  const notePanel = document.createElement("div");
  notePanel.className = "panel";
  notePanel.innerHTML = `<div class="h3">Notizen / Sonstiges</div><textarea class="input" placeholder="Zusätzliche Infos...">${esc(dayData.note || "")}</textarea>`;
  notePanel.querySelector("textarea").oninput = (e) => {
    dayData.note = e.target.value;
    entries[state.selectedDate] = dayData;
    setData(KEY.work, entries);
    saveEntry();
  };
  list.appendChild(notePanel);
}

function renderSetup() {
  const list = $("setup-subject-list");
  if (list) {
    list.innerHTML = "";
    getData(KEY.subjects, []).forEach(s => {
      const c = document.createElement("div");
      c.className = "chip active";
      c.textContent = s;
      list.appendChild(c);
    });
  }

  const grid = $("setup-schooldays");
  if (grid) {
    grid.innerHTML = "";
    const names = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const selDays = getData(KEY.days, [1, 2]);
    names.forEach((n, i) => {
      const b = document.createElement("button");
      b.className = "weekday" + (selDays.includes(i) ? " active" : "");
      b.textContent = n;
      b.onclick = () => {
        let d = getData(KEY.days, [1, 2]);
        d = d.includes(i) ? d.filter(x => x !== i) : [...d, i];
        setData(KEY.days, d);
        renderSetup();
      };
      grid.appendChild(b);
    });
  }
}

function renderReport() {
  const d = new Date(state.selectedDate);
  const mon = new Date(d.setDate(d.getDate() - (d.getDay() || 7) + 1 + (state.weekOff * 7)));
  if ($("report-week-label")) $("report-week-label").textContent = "Woche ab " + mon.toLocaleDateString('de-DE');
  
  let sText = ""; let wSet = new Set();
  const sE = getData(KEY.school, {}); const wE = getData(KEY.work, {});
  
  for (let i = 0; i < 5; i++) {
    const cur = new Date(mon); cur.setDate(cur.getDate() + i);
    const iso = cur.toISOString().split("T")[0];
    if (sE[iso]) Object.entries(sE[iso]).forEach(([k, v]) => { if (v) sText += k + ": " + v + "\n"; });
    if (wE[iso]?.tasks) wE[iso].tasks.forEach(t => wSet.add(t));
  }
  if ($("report-draft-school")) $("report-draft-school").value = sText.trim();
  if ($("report-draft-work")) $("report-draft-work").value = Array.from(wSet).join(", ");
}

function renderSetupTemplates() {
  const t = getData(KEY.workTemplates, {});
  if (Object.keys(t).length === 0) {
    const def = {"Werkstatt": [], "Büro": [], "Service": []};
    setData(KEY.workTemplates, def);
  }
}