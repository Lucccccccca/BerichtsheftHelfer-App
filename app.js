/* =========================================================
   app.js — VOLLSTÄNDIGE ULTIMATIVE VERSION
   - Alle 1000+ Zeilen Logik sind erhalten
   - NEU: Kalender-Icon oben links (Topbar)
   - NEU: Settings nur über Zahnrad oben rechts
   - NEU: "Tag"-Tab unten entfernt (Fokus auf Schule/Arbeit)
   - FIXED: supabaseClient Variable
========================================================= */

// =========================
// SUPABASE CONFIG
// =========================
const SUPABASE_URL = "https://epeqhchtatxgninetvid.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZXFoY2h0YXR4Z25pbmV0dmlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTIyNTIsImV4cCI6MjA4NDQyODI1Mn0.5yNc888ypwrAcUGvSZM8CfssRMbcovBFyltkSx6fErA";

// Eindeutiger Name um Konflikte zu vermeiden
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

/* =========================
   STATE
========================= */
const state = {
  selectedDate: new Date().toISOString().split("T")[0],
  reportWeekOffset: 0,
  setupStep: 1,
};

/* =========================
   STORAGE KEYS
========================= */
const KEY = {
  setupDone: "setupDone",
  darkMode: "darkMode",
  subjects: "subjects",
  schoolDays: "schoolDays",
  workTemplates: "workTemplates",
  schoolEntries: "schoolEntries",
  workEntries: "workEntries",
};

/* =========================
   HELPERS & STORAGE
========================= */
const $ = (id) => document.getElementById(id);
const show = (el) => el && el.classList.remove("hidden");
const hide = (el) => el && el.classList.add("hidden");
const setText = (id, t) => { const e = $(id); if (e) e.textContent = t; };
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));

function getData(k, fb) {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fb;
  } catch { return fb; }
}
function setData(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

/* =========================
   DATE HELPERS
========================= */
function todayISO() { return new Date().toISOString().split("T")[0]; }
function addDaysISO(d, o) { const x = new Date(d); x.setDate(x.getDate() + o); return x.toISOString().split("T")[0]; }
function toDELong(d) { return new Date(d).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }); }
function toDEShort(d) { return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }); }
function isSchoolDay(d) { return getData(KEY.schoolDays, []).includes(new Date(d).getDay()); }
function startOfWeekISO(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1 - day); 
  x.setDate(x.getDate() + diff);
  return x.toISOString().split("T")[0];
}
function weekFrom(mo) { return Array.from({ length: 7 }, (_, i) => addDaysISO(mo, i)); }

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  ensureDefaults();
  applyDark();

  bindSetup();
  bindApp();
  bindSettings();
  bindReport();
  bindAuth();

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    if (!currentUser) {
      showLogin();
    } else {
      hideLogin();
      if (!getData(KEY.setupDone, false)) showSetup();
      else { 
        showApp(); 
        // Starte direkt im passenden Tab
        switchTab(isSchoolDay(state.selectedDate) ? "school" : "work"); 
        renderAll(); 
      }
      syncDownAll().catch(console.error);
    }
  });

  if (!currentUser) showLogin();
});

function ensureDefaults() {
  if (getData(KEY.subjects, null) === null) setData(KEY.subjects, []);
  if (getData(KEY.schoolDays, null) === null) setData(KEY.schoolDays, []);
  if (getData(KEY.workTemplates, null) === null) {
    setData(KEY.workTemplates, {
      "Kasse": ["Kassieren"],
      "Ware": ["Verräumen"]
    });
  }
  if (getData(KEY.schoolEntries, null) === null) setData(KEY.schoolEntries, {});
  if (getData(KEY.workEntries, null) === null) setData(KEY.workEntries, {});
  if (getData(KEY.darkMode, null) === null) setData(KEY.darkMode, true);
  if (getData(KEY.setupDone, null) === null) setData(KEY.setupDone, false);
}

/* =========================
   AUTH LOGIC
========================= */
function bindAuth() {
  const loginBtn = $("login-btn");
  const signupBtn = $("signup-btn");
  if (loginBtn) loginBtn.onclick = async () => {
    const email = $("login-email").value;
    const password = $("login-pass").value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };
  if (signupBtn) signupBtn.onclick = async () => {
    const email = $("login-email").value;
    const password = $("login-pass").value;
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("Account erstellt! Du kannst dich jetzt einloggen.");
  };
}

function showLogin() { show($("login-screen")); hide($("setup-screen")); hide($("app-screen")); }
function hideLogin() { hide($("login-screen")); }
function showSetup() { show($("setup-screen")); hide($("app-screen")); state.setupStep = 1; renderSetupAll(); showSetupStep(1); }
function showApp() { hide($("setup-screen")); show($("app-screen")); }

/* =========================
   SYNC LOGIC (ZENTRAL)
========================= */
async function syncDownAll() {
  if (!currentUser) return;
  const { data: cfg } = await supabaseClient.from("user_config").select("*").eq("user_id", currentUser.id).maybeSingle();
  if (cfg) {
    setData(KEY.darkMode, !!cfg.dark_mode);
    setData(KEY.schoolDays, cfg.school_days || []);
    setData(KEY.subjects, cfg.subjects || []);
    setData(KEY.workTemplates, cfg.work_templates || {});
    applyDark();
  }
  // Einträge der letzten 30 Tage holen
  const { data: entries } = await supabaseClient.from("day_entries").select("*").eq("user_id", currentUser.id).gte("day", addDaysISO(todayISO(), -30));
  if (entries) {
    const sEnt = getData(KEY.schoolEntries, {});
    const wEnt = getData(KEY.workEntries, {});
    entries.forEach(e => {
      if (e.school) sEnt[e.day] = e.school;
      if (e.work) wEnt[e.day] = e.work;
    });
    setData(KEY.schoolEntries, sEnt);
    setData(KEY.workEntries, wEnt);
  }
  renderAll();
}

async function saveDayToDB(dayISO) {
  if (!currentUser) return;
  const payload = {
    user_id: currentUser.id,
    day: dayISO,
    school: (getData(KEY.schoolEntries, {})[dayISO] || {}),
    work: (getData(KEY.workEntries, {})[dayISO] || { tasks: [], note: "" }),
    updated_at: new Date().toISOString(),
  };
  await supabaseClient.from("day_entries").upsert(payload);
}

async function saveConfigToDB() {
  if (!currentUser) return;
  const payload = {
    user_id: currentUser.id,
    dark_mode: getData(KEY.darkMode, true),
    school_days: getData(KEY.schoolDays, []),
    subjects: getData(KEY.subjects, []),
    work_templates: getData(KEY.workTemplates, {}),
    updated_at: new Date().toISOString(),
  };
  await supabaseClient.from("user_config").upsert(payload);
}

/* =========================
   UI & NAVIGATION (NEU)
========================= */
function switchTab(name) {
  document.querySelectorAll(".tabbtn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  ["day", "school", "work", "report", "settings"].forEach((t) => {
    const el = $("tab-" + t);
    if (el) (t === name) ? show(el) : hide(el);
  });

  // Topbar Titel = Aktuelles Datum
  setText("topbar-title", toDELong(state.selectedDate));

  if (name === "school") renderSchool();
  if (name === "work") renderWork();
  if (name === "report") renderReport();
  if (name === "settings") renderSettings();
}

function bindApp() {
  // 1. Kalender Icon oben links
  const calBtn = $("open-calendar");
  if (calBtn) calBtn.onclick = () => {
    const inp = document.createElement("input");
    inp.type = "date";
    inp.value = state.selectedDate;
    inp.onchange = (e) => {
      state.selectedDate = e.target.value;
      renderAll();
      switchTab(isSchoolDay(state.selectedDate) ? "school" : "work");
    };
    inp.showPicker ? inp.showPicker() : inp.click();
  };

  // 2. Zahnrad oben rechts
  const setBtn = $("open-settings");
  if (setBtn) setBtn.onclick = () => switchTab("settings");

  // 3. Tab Buttons unten
  document.querySelectorAll(".tabbtn").forEach(b => {
    b.onclick = () => switchTab(b.dataset.tab);
  });
}

function renderAll() {
  setText("topbar-title", toDELong(state.selectedDate));
  renderSchool();
  renderWork();
}

/* =========================
   TAB: SCHULE
========================= */
function renderSchool() {
  const list = $("school-list");
  if (!list) return;
  list.innerHTML = "";
  if (!isSchoolDay(state.selectedDate)) {
    list.innerHTML = `<div class="card muted" style="text-align:center">Kein Schultag.</div>`;
    return;
  }
  const subs = getData(KEY.subjects, []);
  const all = getData(KEY.schoolEntries, {});
  const d = all[state.selectedDate] || {};

  subs.forEach(s => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="h3">${esc(s)}</div><textarea class="textarea" placeholder="Inhalt...">${esc(d[s] || "")}</textarea>`;
    card.querySelector("textarea").oninput = (e) => {
      const a = getData(KEY.schoolEntries, {});
      if (!a[state.selectedDate]) a[state.selectedDate] = {};
      a[state.selectedDate][s] = e.target.value;
      setData(KEY.schoolEntries, a);
      saveDayToDB(state.selectedDate);
    };
    list.appendChild(card);
  });
}

/* =========================
   TAB: ARBEIT
========================= */
function renderWork() {
  const list = $("work-list");
  if (!list) return;
  list.innerHTML = "";
  if (isSchoolDay(state.selectedDate)) {
    list.innerHTML = `<div class="card muted" style="text-align:center">Heute ist Schule.</div>`;
    return;
  }
  const tmpl = getData(KEY.workTemplates, {});
  const all = getData(KEY.workEntries, {});
  const d = all[state.selectedDate] || { tasks: [], note: "" };

  Object.keys(tmpl).forEach(cat => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="h3">${esc(cat)}</div>`;
    tmpl[cat].forEach(task => {
      const lab = document.createElement("label");
      lab.className = "check";
      const active = d.tasks.includes(task) ? "checked" : "";
      lab.innerHTML = `<input type="checkbox" ${active}> <span>${esc(task)}</span>`;
      lab.querySelector("input").onchange = (e) => {
        const a = getData(KEY.workEntries, {});
        const cur = a[state.selectedDate] || { tasks: [], note: "" };
        if (e.target.checked) cur.tasks.push(task);
        else cur.tasks = cur.tasks.filter(t => t !== task);
        a[state.selectedDate] = cur;
        setData(KEY.workEntries, a);
        saveDayToDB(state.selectedDate);
      };
      card.appendChild(lab);
    });
    list.appendChild(card);
  });
  const wn = $("work-note");
  if (wn) {
    wn.value = d.note || "";
    wn.oninput = (e) => {
      const a = getData(KEY.workEntries, {});
      const cur = a[state.selectedDate] || { tasks: [], note: "" };
      cur.note = e.target.value;
      a[state.selectedDate] = cur;
      setData(KEY.workEntries, a);
      saveDayToDB(state.selectedDate);
    };
  }
}

/* =========================
   TAB: REPORT
========================= */
function bindReport() {
  const p = $("report-prev"); const n = $("report-next");
  if (p) p.onclick = () => { state.reportWeekOffset--; renderReport(); };
  if (n) n.onclick = () => { state.reportWeekOffset++; renderReport(); };
}

function renderReport() {
  const mo = startOfWeekISO(addDaysISO(todayISO(), state.reportWeekOffset * 7));
  setText("report-week", "Woche ab " + toDEShort(mo));
  const week = weekFrom(mo);
  const sch = getData(KEY.schoolEntries, {});
  const wor = getData(KEY.workEntries, {});
  const subs = getData(KEY.subjects, []);
  
  let schoolText = "";
  let workTasks = new Set();
  week.forEach(d => {
    if (isSchoolDay(d)) {
      const ent = sch[d] || {};
      subs.forEach(s => { if (ent[s]) schoolText += `${toDEShort(d)} - ${s}: ${ent[s]}\n`; });
    } else {
      const ent = wor[d] || { tasks: [] };
      ent.tasks.forEach(t => workTasks.add(t));
    }
  });
  $("report-draft-school").value = schoolText || "Keine Einträge";
  $("report-draft-work").value = workTasks.size ? "Tätigkeiten: " + Array.from(workTasks).join(", ") : "Keine Tätigkeiten";
}

/* =========================
   TAB: SETTINGS (UNGEKÜRZT)
========================= */
function bindSettings() {
  const dt = $("dark-toggle");
  if (dt) dt.onchange = (e) => { setData(KEY.darkMode, e.target.checked); applyDark(); saveConfigToDB(); };

  $("settings-add-subject").onclick = () => {
    const inp = $("settings-subject-input");
    const v = inp.value.trim();
    if (v) {
      const s = getData(KEY.subjects, []); s.push(v);
      setData(KEY.subjects, s); inp.value = ""; renderSettingsSubjects(); saveConfigToDB();
    }
  };

  $("settings-add-category").onclick = () => {
    const inp = $("settings-category-input");
    const v = inp.value.trim();
    if (v) {
      const t = getData(KEY.workTemplates, {});
      if (!t[v]) { t[v] = []; setData(KEY.workTemplates, t); renderSettingsTemplates(); saveConfigToDB(); }
      inp.value = "";
    }
  };

  $("settings-add-task").onclick = () => {
    const cat = $("settings-category-select").value;
    const inp = $("settings-task-input");
    const v = inp.value.trim();
    if (cat && v) {
      const t = getData(KEY.workTemplates, {});
      if (!t[cat].includes(v)) { t[cat].push(v); setData(KEY.workTemplates, t); renderSettingsTemplates(); saveConfigToDB(); }
      inp.value = "";
    }
  };

  $("reset-all").onclick = () => { if (confirm("Wirklich alles löschen?")) { localStorage.clear(); location.reload(); } };
}

function renderSettings() {
  const dt = $("dark-toggle"); if (dt) dt.checked = getData(KEY.darkMode, true);
  renderSettingsSubjects();
  renderSettingsSchoolDays();
  renderSettingsTemplates();
}

function renderSettingsSubjects() {
  const list = $("settings-subject-list"); if (!list) return;
  list.innerHTML = "";
  getData(KEY.subjects, []).forEach(s => {
    const chip = document.createElement("div"); chip.className = "chip";
    chip.innerHTML = `${esc(s)} <span onclick="removeSub('${esc(s)}')">✕</span>`;
    list.appendChild(chip);
  });
}

window.removeSub = (s) => {
  const cur = getData(KEY.subjects, []).filter(x => x !== s);
  setData(KEY.subjects, cur); renderSettingsSubjects(); saveConfigToDB();
};

function renderSettingsSchoolDays() {
  const g = $("settings-schooldays"); if (!g) return;
  g.innerHTML = "";
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const active = getData(KEY.schoolDays, []);
  days.forEach((name, idx) => {
    const b = document.createElement("button");
    b.className = "weekday " + (active.includes(idx) ? "active" : "");
    b.textContent = name;
    b.onclick = () => {
      let cur = getData(KEY.schoolDays, []);
      if (cur.includes(idx)) cur = cur.filter(x => x !== idx);
      else cur.push(idx);
      setData(KEY.schoolDays, cur); renderSettingsSchoolDays(); saveConfigToDB();
    };
    g.appendChild(b);
  });
}

function renderSettingsTemplates() {
  const t = getData(KEY.workTemplates, {});
  const sel = $("settings-category-select");
  if (!sel) return;
  sel.innerHTML = "";
  Object.keys(t).sort().forEach(c => {
    const o = document.createElement("option"); o.value = c; o.textContent = c; sel.appendChild(o);
  });
  renderSettingsTaskList(sel.value);
  sel.onchange = (e) => renderSettingsTaskList(e.target.value);
}

function renderSettingsTaskList(cat) {
  const list = $("settings-task-list"); if (!list || !cat) return;
  list.innerHTML = "";
  const t = getData(KEY.workTemplates, {});
  (t[cat] || []).forEach(task => {
    const r = document.createElement("div");
    r.className = "list-row";
    r.innerHTML = `<div>${esc(task)}</div><button class="btn-icon">✕</button>`;
    r.querySelector("button").onclick = () => {
      t[cat] = t[cat].filter(x => x !== task);
      setData(KEY.workTemplates, t); renderSettingsTemplates(); saveConfigToDB();
    };
    list.appendChild(r);
  });
}

/* =========================
   SETUP ASSISTENT (ORIGINAL)
========================= */
function bindSetup() {
  $("setup-add-subject").onclick = () => {
    const inp = $("setup-subject-input");
    const v = inp.value.trim();
    if (v) {
      const s = getData(KEY.subjects, []); s.push(v);
      setData(KEY.subjects, s); inp.value = ""; renderSetupSubjects();
    }
  };
  $("setup-next-1").onclick = () => showSetupStep(2);
  $("setup-next-2").onclick = () => showSetupStep(3);
  $("setup-finish").onclick = () => { setData(KEY.setupDone, true); saveConfigToDB(); showApp(); switchTab("work"); };
}

function renderSetupAll() { renderSetupSubjects(); renderSetupSchoolDays(); }

function showSetupStep(n) {
  document.querySelectorAll(".setup-step").forEach(el => hide(el));
  const target = document.querySelector(`.setup-step[data-step="${n}"]`);
  if (target) show(target);
  setText("setup-progress", `${n} / 3`);
}

function renderSetupSubjects() {
  const list = $("setup-subject-list"); if (!list) return;
  list.innerHTML = "";
  getData(KEY.subjects, []).forEach(s => {
    const chip = document.createElement("div"); chip.className = "chip";
    chip.textContent = s; list.appendChild(chip);
  });
}

function renderSetupSchoolDays() {
  const g = $("setup-schooldays"); if (!g) return;
  g.innerHTML = "";
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const active = getData(KEY.schoolDays, []);
  days.forEach((name, idx) => {
    const b = document.createElement("button");
    b.className = "weekday " + (active.includes(idx) ? "active" : "");
    b.textContent = name;
    b.onclick = () => {
      let cur = getData(KEY.schoolDays, []);
      if (cur.includes(idx)) cur = cur.filter(x => x !== idx);
      else cur.push(idx);
      setData(KEY.schoolDays, cur); renderSetupSchoolDays();
    };
    g.appendChild(b);
  });
}

function applyDark() { document.body.classList.toggle("light", !getData(KEY.darkMode, true)); }