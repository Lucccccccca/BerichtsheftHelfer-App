/* =========================================================
   app.js — FULL VERSION (basic, stabil, Dark/Light)
   PASST zu index.html mit:
   - setup-screen / app-screen
   - tabs: day, school, work, report, settings
   - report-draft-school + report-draft-work (KEIN copy-draft / KEIN report-draft)
========================================================= */
    // =========================
// SUPABASE CONFIG
// =========================
const SUPABASE_URL = "https://epeqhchtatxgninetvid.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZXFoY2h0YXR4Z25pbmV0dmlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTIyNTIsImV4cCI6MjA4NDQyODI1Mn0.5yNc888ypwrAcUGvSZM8CfssRMbcovBFyltkSx6fErA";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

function showLogin() {
  show($("login-screen"));
  hide($("setup-screen"));
  hide($("app-screen"));
}
function hideLogin() {
  hide($("login-screen"));
}

/* =========================
   STATE
========================= */
const state = {
  selectedDate: todayISO(),
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
  schoolDays: "schoolDays",        // [0-6] So..Sa
  workTemplates: "workTemplates",  // {cat:[task]}
  schoolEntries: "schoolEntries",  // {date:{subject:text}}
  workEntries: "workEntries",      // {date:{tasks:[], note:""}}
};

/* =========================
   STORAGE HELPERS
========================= */
function getData(k, fb) {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fb;
  } catch {
    return fb;
  }
}
function setData(k, v) {
  localStorage.setItem(k, JSON.stringify(v));
}

/* =========================
   DEFAULTS
========================= */
function ensureDefaults() {
  if (getData(KEY.subjects, null) === null) setData(KEY.subjects, []);
  if (getData(KEY.schoolDays, null) === null) setData(KEY.schoolDays, []);
  if (getData(KEY.workTemplates, null) === null) {
    setData(KEY.workTemplates, {
      Kasse: ["Kassieren"],
      Service: ["Pfand", "HGA", "Putzen"],
      Ware: ["Lieferung verräumen", "Abschachteln", "MHD Kontrolle", "DD Fahren"],
      "Bake-Off": ["Auflegen", "Nachbacken", "Reinigen"],
    });
  }
  if (getData(KEY.schoolEntries, null) === null) setData(KEY.schoolEntries, {});
  if (getData(KEY.workEntries, null) === null) setData(KEY.workEntries, {});
  if (getData(KEY.darkMode, null) === null) setData(KEY.darkMode, true);
  if (getData(KEY.setupDone, null) === null) setData(KEY.setupDone, false);
}

/* =========================
   DOM HELPERS
========================= */
const $ = (id) => document.getElementById(id);
const show = (el) => el && el.classList.remove("hidden");
const hide = (el) => el && el.classList.add("hidden");
const setText = (id, t) => {
  const e = $(id);
  if (e) e.textContent = t;
};
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));

/* =========================
   DATE HELPERS
========================= */
function todayISO() { return new Date().toISOString().split("T")[0]; }
function addDaysISO(d, o) { const x = new Date(d); x.setDate(x.getDate() + o); return x.toISOString().split("T")[0]; }
function toDELong(d) { return new Date(d).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
function toDEShort(d) { return new Date(d).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }); }
function isSchoolDay(d) {
  const days = getData(KEY.schoolDays, []);
  return days.includes(new Date(d).getDay());
}
function startOfWeekISO(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1 - day); // Monday start
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

  // UI bindings
  bindSetup();
  bindApp();
  bindSettings();
  bindReport();
  bindAuth();

  // Auth Session check
  const { data } = await supabase.auth.getSession();
  currentUser = data.session?.user || null;

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    if (!currentUser) {
      showLogin();
    } else {
      hideLogin();
      // App anzeigen
      if (!getData(KEY.setupDone, false)) showSetup();
      else { showApp(); switchTab("day"); renderAll(); }
      // Daten aus DB ziehen
      syncDownAll().catch(console.error);
    }
  });

  // Beim Start
  if (!currentUser) {
    showLogin();
    return;
  }

  // bereits eingeloggt
  hideLogin();
  if (!getData(KEY.setupDone, false)) showSetup();
  else { showApp(); switchTab("day"); renderAll(); }
  await syncDownAll();
});



    function bindAuth() {
  const loginBtn = $("login-btn");
  const signupBtn = $("signup-btn");
  const msg = $("login-msg");

  if (loginBtn) loginBtn.onclick = async () => {
    const email = ($("login-email")?.value || "").trim();
    const pass = ($("login-pass")?.value || "").trim();
    if (!email || !pass) { if(msg) msg.textContent="Bitte E-Mail + Passwort eingeben."; return; }

    if (msg) msg.textContent = "Login...";
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) { if(msg) msg.textContent = "Fehler: " + error.message; }
  };

  if (signupBtn) signupBtn.onclick = async () => {
    const email = ($("login-email")?.value || "").trim();
    const pass = ($("login-pass")?.value || "").trim();
    if (!email || !pass) { if(msg) msg.textContent="Bitte E-Mail + Passwort eingeben."; return; }

    if (msg) msg.textContent = "Registrierung...";
    const { error } = await supabase.auth.signUp({ email, password: pass });
    if (error) { if(msg) msg.textContent = "Fehler: " + error.message; }
    else { if(msg) msg.textContent = "Account erstellt. Du kannst dich jetzt einloggen."; }
  };
}

async function ensureUserConfigRow() {
  if (!currentUser) return;
  const user_id = currentUser.id;

  const { data, error } = await supabase
    .from("user_config")
    .select("user_id")
    .eq("user_id", user_id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    // initial config aus localStorage übernehmen
    const payload = {
      user_id,
      dark_mode: getData(KEY.darkMode, true),
      school_days: getData(KEY.schoolDays, []),
      subjects: getData(KEY.subjects, []),
      work_templates: getData(KEY.workTemplates, {}),
      updated_at: new Date().toISOString(),
    };

    const ins = await supabase.from("user_config").insert(payload);
    if (ins.error) throw ins.error;
  }
}

async function syncDownAll() {
  if (!currentUser) return;
  await ensureUserConfigRow();

  const user_id = currentUser.id;

  // 1) Config runterladen
  const cfgRes = await supabase
    .from("user_config")
    .select("*")
    .eq("user_id", user_id)
    .single();

  if (cfgRes.error) throw cfgRes.error;

  const cfg = cfgRes.data;
  setData(KEY.darkMode, !!cfg.dark_mode);
  setData(KEY.schoolDays, cfg.school_days || []);
  setData(KEY.subjects, cfg.subjects || []);
  setData(KEY.workTemplates, cfg.work_templates || {});
  applyDark();

  // 2) Einträge (nur letzte 90 Tage als Start – reicht erstmal)
  const from = new Date(); from.setDate(from.getDate() - 90);
  const fromISO = from.toISOString().slice(0,10);

  const entRes = await supabase
    .from("day_entries")
    .select("day, school, work")
    .eq("user_id", user_id)
    .gte("day", fromISO);

  if (entRes.error) throw entRes.error;

  const schoolEntries = getData(KEY.schoolEntries, {});
  const workEntries = getData(KEY.workEntries, {});

  for (const row of (entRes.data || [])) {
    const day = row.day; // YYYY-MM-DD
    if (row.school) schoolEntries[day] = row.school;
    if (row.work) workEntries[day] = row.work;
  }

  setData(KEY.schoolEntries, schoolEntries);
  setData(KEY.workEntries, workEntries);
  saveDayToDB(state.selectedDate);

  // UI neu rendern
  renderAll();
  renderSchool();
  renderWork();
  renderReport();
}

async function saveConfigToDB() {
  if (!currentUser) return;
  const user_id = currentUser.id;

  const payload = {
    user_id,
    dark_mode: getData(KEY.darkMode, true),
    school_days: getData(KEY.schoolDays, []),
    subjects: getData(KEY.subjects, []),
    work_templates: getData(KEY.workTemplates, {}),
    updated_at: new Date().toISOString(),
  };

  const res = await supabase.from("user_config").upsert(payload);
  if (res.error) console.error(res.error);
}

async function saveDayToDB(dayISO) {
  if (!currentUser) return;
  const user_id = currentUser.id;

  const school = (getData(KEY.schoolEntries, {})[dayISO] || {});
  const work = (getData(KEY.workEntries, {})[dayISO] || { tasks: [], note: "" });

  const payload = {
    user_id,
    day: dayISO,
    school,
    work,
    updated_at: new Date().toISOString(),
  };

  const res = await supabase.from("day_entries").upsert(payload);
  if (res.error) console.error(res.error);
}



/* =========================
   SCREEN SWITCH
========================= */
function showSetup() {
  show($("setup-screen"));
  hide($("app-screen"));
  state.setupStep = 1;
  renderSetupAll();
  showSetupStep(1);
}
function showApp() {
  hide($("setup-screen"));
  show($("app-screen"));
}

/* =========================
   TABS
========================= */
function switchTab(name) {
  // activate bottom buttons
  document.querySelectorAll(".tabbtn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));

  // show/hide tab contents
  ["day", "school", "work", "report", "settings"].forEach((t) => {
    const el = $("tab-" + t);
    if (!el) return;
    (t === name) ? show(el) : hide(el);
  });

  // topbar title (optional)
  setText("topbar-title", {
    day: "Tag",
    school: "Schule",
    work: "Arbeit",
    report: "Berichtsheft",
    settings: "Einstellungen",
  }[name] || "Tag");

  // render current tab
  if (name === "day") renderDay();
  if (name === "school") renderSchool();
  if (name === "work") renderWork();
  if (name === "report") renderReport();
  if (name === "settings") renderSettings();
}

/* =========================
   BIND APP UI
========================= */
function bindApp() {
  // bottom tabs
  document.querySelectorAll(".tabbtn").forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));

  // topbar settings icon
  const openSettings = $("open-settings");
  if (openSettings) openSettings.onclick = () => switchTab("settings");

  // day navigation
  const prev = $("day-prev");
  const next = $("day-next");
  const edit = $("day-edit");

  if (prev) prev.onclick = () => { state.selectedDate = addDaysISO(state.selectedDate, -1); renderAll(); };
  if (next) next.onclick = () => { state.selectedDate = addDaysISO(state.selectedDate, 1); renderAll(); };
  if (edit) edit.onclick = () => switchTab(isSchoolDay(state.selectedDate) ? "school" : "work");

  // work note
  const note = $("work-note");
  if (note) {
    note.oninput = (e) => {
      const all = getData(KEY.workEntries, {});
      const d = all[state.selectedDate] || { tasks: [], note: "" };
      d.note = e.target.value;
      all[state.selectedDate] = d;
      setData(KEY.workEntries, all);
    saveDayToDB(state.selectedDate);
    renderDaySummary();
    renderWorkPill();
    };
  }
}

function renderAll() {
  renderDay();
  renderSchoolHeader();
  renderWorkHeader();
}

/* =========================
   TAB: DAY
========================= */
function renderDay() {
  setText("day-date", toDELong(state.selectedDate));
  setText("day-type", isSchoolDay(state.selectedDate) ? "Heute ist Schule" : "Heute ist Arbeit");
  renderDaySummary();
}

function renderDaySummary() {
  const sch = getData(KEY.schoolEntries, {});
  const wor = getData(KEY.workEntries, {});
  const subs = getData(KEY.subjects, []);

  let lines = [];
  let count = 0;

  if (isSchoolDay(state.selectedDate)) {
    const d = sch[state.selectedDate] || {};
    subs.forEach((s) => {
      const v = (d[s] || "").trim();
      if (v) {
        count++;
        lines.push(`• ${s}: ${v.slice(0, 60)}${v.length > 60 ? "…" : ""}`);
      }
    });
    if (!lines.length) lines.push("Noch keine Themen.");
  } else {
    const d = wor[state.selectedDate] || { tasks: [], note: "" };
    if (d.tasks?.length) {
      count += d.tasks.length;
      lines.push("• Tätigkeiten: " + d.tasks.slice(0, 6).join(", ") + (d.tasks.length > 6 ? "…" : ""));
    } else {
      lines.push("• Keine Tätigkeiten.");
    }
    if ((d.note || "").trim()) {
      count++;
      lines.push("• Notiz: " + d.note.slice(0, 80) + (d.note.length > 80 ? "…" : ""));
    }
  }

  setText("day-summary-pill", String(count));
  const box = $("day-summary");
  if (box) box.innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join("");
}

/* =========================
   TAB: SCHOOL
========================= */
function renderSchoolHeader() {
  setText("school-date", toDELong(state.selectedDate));
}

function renderSchool() {
  renderSchoolHeader();

  const list = $("school-list");
  if (!list) return;
  list.innerHTML = "";

  if (!isSchoolDay(state.selectedDate)) {
    list.innerHTML = `<div class="card"><div class="muted">Heute ist kein Berufsschultag.</div></div>`;
    setText("school-pill", "0");
    return;
  }

  const subs = getData(KEY.subjects, []);
  const all = getData(KEY.schoolEntries, {});
  const d = all[state.selectedDate] || {};
  let filled = 0;

  subs.forEach((s) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="h3">${esc(s)}</div>
      <textarea class="textarea" placeholder="Thema / Inhalt...">${esc(d[s] || "")}</textarea>
    `;

    const ta = card.querySelector("textarea");
    ta.oninput = (e) => {
      const a = getData(KEY.schoolEntries, {});
      a[state.selectedDate] = a[state.selectedDate] || {};
      a[state.selectedDate][s] = e.target.value;
      setData(KEY.schoolEntries, a);
      renderDaySummary();
      renderSchoolPill();
    };

    list.appendChild(card);
    if ((d[s] || "").trim()) filled++;
  });

  setText("school-pill", String(filled));
}

function renderSchoolPill() {
  if (!isSchoolDay(state.selectedDate)) { setText("school-pill", "0"); return; }
  const subs = getData(KEY.subjects, []);
  const d = (getData(KEY.schoolEntries, {})[state.selectedDate] || {});
  const n = subs.reduce((a, s) => a + (((d[s] || "").trim()) ? 1 : 0), 0);
  setText("school-pill", String(n));
}

/* =========================
   TAB: WORK
========================= */
function renderWorkHeader() {
  setText("work-date", toDELong(state.selectedDate));
}

function renderWork() {
  renderWorkHeader();

  const list = $("work-list");
  if (!list) return;
  list.innerHTML = "";

  if (isSchoolDay(state.selectedDate)) {
    list.innerHTML = `<div class="card"><div class="muted">Heute ist kein Arbeitstag.</div></div>`;
    const wn = $("work-note");
    if (wn) wn.value = "";
    setText("work-pill", "0");
    return;
  }

  const t = getData(KEY.workTemplates, {});
  const all = getData(KEY.workEntries, {});
  const d = all[state.selectedDate] || { tasks: [], note: "" };

  Object.keys(t).sort().forEach((cat) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="h3">${esc(cat)}</div>`;

    (t[cat] || []).forEach((task) => {
      const lab = document.createElement("label");
      lab.className = "check";
      const checked = d.tasks?.includes(task) ? "checked" : "";
      lab.innerHTML = `<input type="checkbox" ${checked}><span>${esc(task)}</span>`;

      lab.querySelector("input").onchange = (e) => {
        const a = getData(KEY.workEntries, {});
        const x = a[state.selectedDate] || { tasks: [], note: "" };

        if (e.target.checked) {
          if (!x.tasks.includes(task)) x.tasks.push(task);
        } else {
          x.tasks = x.tasks.filter((z) => z !== task);
        }

        a[state.selectedDate] = x;
        setData(KEY.workEntries, a);
        saveDayToDB(state.selectedDate);

        renderDaySummary();
        renderWorkPill();
      };

      card.appendChild(lab);
    });

    list.appendChild(card);
  });

  const wn = $("work-note");
  if (wn) wn.value = d.note || "";
  renderWorkPill();
}

function renderWorkPill() {
  if (isSchoolDay(state.selectedDate)) { setText("work-pill", "0"); return; }
  const d = (getData(KEY.workEntries, {})[state.selectedDate] || { tasks: [], note: "" });
  const n = (d.tasks?.length || 0) + (((d.note || "").trim()) ? 1 : 0);
  setText("work-pill", String(n));
}

/* =========================
   TAB: REPORT
========================= */
function bindReport() {
  const prev = $("report-prev");
  const next = $("report-next");

  // IMPORTANT: no copy-draft binding (doesn't exist)
  if (prev) prev.onclick = () => { state.reportWeekOffset--; renderReport(); };
  if (next) next.onclick = () => { state.reportWeekOffset++; renderReport(); };
}

function renderReport() {
  const base = addDaysISO(todayISO(), state.reportWeekOffset * 7);
  const mo = startOfWeekISO(base);

  setText("report-week", "Woche ab " + new Date(mo).toLocaleDateString("de-DE"));

  const week = weekFrom(mo);

  // week list
  const list = $("report-week-list");
  if (list) list.innerHTML = "";

  const sch = getData(KEY.schoolEntries, {});
  const wor = getData(KEY.workEntries, {});
  const subs = getData(KEY.subjects, []);
  let workDays = 0, schoolDays = 0;

  week.forEach((d) => {
    const isSch = isSchoolDay(d);
    if (isSch) schoolDays++; else workDays++;

    let cnt = 0;
    let sub = "";

    if (isSch) {
      const x = sch[d] || {};
      const f = subs.filter((s) => (x[s] || "").trim()).length;
      cnt = f;
      sub = f ? subs.filter((s) => (x[s] || "").trim()).slice(0, 3).join(", ") : "keine Themen";
    } else {
      const x = wor[d] || { tasks: [], note: "" };
      cnt = (x.tasks?.length || 0) + (((x.note || "").trim()) ? 1 : 0);
      sub = x.tasks?.length ? x.tasks.slice(0, 3).join(", ") : "keine Tätigkeiten";
    }

    if (list) {
      const row = document.createElement("div");
      row.className = "week-item";
      row.innerHTML = `
        <div class="week-left">
          <div class="week-date">${esc(toDEShort(d))}</div>
          <div class="muted">${esc(isSch ? "Schule" : "Arbeit")} • ${esc(sub)}</div>
        </div>
        <div class="pill">${cnt}</div>
      `;
      row.onclick = () => {
        state.selectedDate = d;
        renderAll();
        switchTab(isSchoolDay(d) ? "school" : "work");
      };
      list.appendChild(row);
    }
  });

  const stats = $("report-stats");
  if (stats) stats.textContent = `Arbeitstage: ${workDays} • Schultage: ${schoolDays}`;

  // write drafts into the 2 textareas
  buildDraft(week);
}

function buildDraft(week) {
  const schoolEntries = getData(KEY.schoolEntries, {});
  const workEntries = getData(KEY.workEntries, {});
  const subjects = getData(KEY.subjects, []);

  /* =========
     ARBEIT – schöner Wochen-Text (A)
  ========= */
  let taskCount = {};
  let notes = [];

  week.forEach((date) => {
    if (!isSchoolDay(date)) {
      const day = workEntries[date] || { tasks: [], note: "" };
      day.tasks.forEach((t) => taskCount[t] = (taskCount[t] || 0) + 1);
      if ((day.note || "").trim()) notes.push(day.note.trim());
    }
  });

  const tasks = Object.keys(taskCount);
  let workText = "";

  if (tasks.length) {
    const mainTasks = tasks.slice(0, 4).join(", ");
    workText += `In dieser Woche war ich überwiegend im Betrieb eingesetzt. `;
    workText += `Dabei habe ich unter anderem ${mainTasks} durchgeführt. `;
  } else {
    workText += `In dieser Woche habe ich meine regulären Tätigkeiten im Betrieb ausgeführt. `;
  }

  if (tasks.length > 4) {
    workText += `Zusätzlich habe ich weitere anfallende Aufgaben im Tagesgeschäft übernommen. `;
  }

  if (notes.length) {
    workText += `Besondere Vorkommnisse waren: ${notes[0]}.`;
  }

  /* =========
     SCHULE – Stichpunkte
  ========= */
  let schoolLines = [];

  week.forEach((date) => {
    if (isSchoolDay(date)) {
      const day = schoolEntries[date] || {};
      subjects.forEach((sub) => {
        const txt = (day[sub] || "").trim();
        if (txt) schoolLines.push(`- ${sub}: ${txt}`);
      });
    }
  });

  const schoolField = $("report-draft-school");
  const workField = $("report-draft-work");

  if (schoolField) {
    schoolField.value = schoolLines.length ? schoolLines.join("\n") : "Keine Berufsschul-Themen dokumentiert.";
  }
  if (workField) {
    workField.value = workText || "Keine Arbeitstätigkeiten dokumentiert.";
  }
}

/* =========================
   SETTINGS
========================= */
function bindSettings() {
  const dt = $("dark-toggle");
  if (dt) {
    dt.onchange = (e) => {
      setData(KEY.darkMode, e.target.checked);
      applyDark();
      saveConfigToDB();

    };
  }

  const addSub = $("settings-add-subject");
  if (addSub) addSub.onclick = () => {
    const input = $("settings-subject-input");
    const v = (input?.value || "").trim();
    if (!v) return;

    const s = getData(KEY.subjects, []);
    if (!s.includes(v)) s.push(v);
    setData(KEY.subjects, s);
    saveConfigToDB();
    if (input) input.value = "";

    renderSettings();
    renderSchool();
  };

  const addCat = $("settings-add-category");
  if (addCat) addCat.onclick = () => {
    const input = $("settings-category-input");
    const v = (input?.value || "").trim();
    if (!v) return;

    const t = getData(KEY.workTemplates, {});
    if (!t[v]) t[v] = [];
    setData(KEY.workTemplates, t);
    
    saveConfigToDB();

    if (input) input.value = "";

    renderSettings();
    renderWork();
  };

  const addTask = $("settings-add-task");
  if (addTask) addTask.onclick = () => {
    const sel = $("settings-category-select");
    const cat = sel?.value;
    const input = $("settings-task-input");
    const v = (input?.value || "").trim();
    if (!cat || !v) return;

    const t = getData(KEY.workTemplates, {});
    if (!t[cat]) t[cat] = [];
    if (!t[cat].includes(v)) t[cat].push(v);
    setData(KEY.workTemplates, t);
    saveConfigToDB();

    if (input) input.value = "";

    renderSettings();
    renderWork();
  };

  const reset = $("reset-all");
  if (reset) reset.onclick = () => {
    if (!confirm("Alles löschen & neu einrichten?")) return;
    localStorage.clear();
    ensureDefaults();
    applyDark();
    showSetup();
  };
}

function renderSettings() {
  const dt = $("dark-toggle");
  if (dt) dt.checked = getData(KEY.darkMode, true);

  renderSettingsSubjects();
  renderSettingsSchoolDays();
  renderSettingsTemplates();
}

function renderSettingsSubjects() {
  const list = $("settings-subject-list");
  if (!list) return;
  list.innerHTML = "";

  getData(KEY.subjects, []).forEach((s) => {
    const c = document.createElement("button");
    c.className = "chip";
    c.innerHTML = `${esc(s)} <span class="x">✕</span>`;
    c.onclick = () => {
      setData(KEY.subjects, getData(KEY.subjects, []).filter((x) => x !== s));
      renderSettings();
      renderSchool();
    };
    list.appendChild(c);
  });
}

const WEEKDAYS = [
  { id: 1, l: "Mo" },
  { id: 2, l: "Di" },
  { id: 3, l: "Mi" },
  { id: 4, l: "Do" },
  { id: 5, l: "Fr" },
  { id: 6, l: "Sa" },
  { id: 0, l: "So" },
];

function renderSettingsSchoolDays() {
  const g = $("settings-schooldays");
  if (!g) return;
  g.innerHTML = "";

  const d = getData(KEY.schoolDays, []);
  WEEKDAYS.forEach((w) => {
    const b = document.createElement("button");
    b.className = "weekday " + (d.includes(w.id) ? "active" : "");
    b.textContent = w.l;
    b.onclick = () => {
      const x = getData(KEY.schoolDays, []);
      const i = x.indexOf(w.id);
      (i >= 0) ? x.splice(i, 1) : x.push(w.id);
      setData(KEY.schoolDays, x);
      saveConfigToDB();


      renderSettingsSchoolDays();
      renderAll();
      renderSchool();
      renderWork();
    };
    g.appendChild(b);
  });
}

function renderSettingsTemplates() {
  const t = getData(KEY.workTemplates, {});
  const sel = $("settings-category-select");
  if (!sel) return;

  sel.innerHTML = "";
  Object.keys(t).sort().forEach((c) => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  });

  if (!sel.value && sel.options.length) sel.value = sel.options[0].value;

  renderSettingsTaskList(sel.value);
  sel.onchange = (e) => renderSettingsTaskList(e.target.value);
}

function renderSettingsTaskList(cat) {
  const list = $("settings-task-list");
  if (!list) return;
  list.innerHTML = "";
  if (!cat) return;

  const t = getData(KEY.workTemplates, {});
  (t[cat] || []).forEach((task) => {
    const r = document.createElement("div");
    r.className = "list-row";
    r.innerHTML = `<div>${esc(task)}</div><button class="btn btn-ghost" type="button">✕</button>`;
    r.querySelector("button").onclick = () => {
      const x = getData(KEY.workTemplates, {});
      x[cat] = (x[cat] || []).filter((z) => z !== task);
      setData(KEY.workTemplates, x);
      renderSettingsTaskList(cat);
      renderWork();
    };
    list.appendChild(r);
  });
}

/* =========================
   SETUP WIZARD
========================= */
function bindSetup() {
  const addSub = $("setup-add-subject");
  if (addSub) addSub.onclick = () => {
    const input = $("setup-subject-input");
    const v = (input?.value || "").trim();
    if (!v) return;

    const s = getData(KEY.subjects, []);
    if (!s.includes(v)) s.push(v);
    setData(KEY.subjects, s);
    if (input) input.value = "";

    renderSetupSubjects();
  };

  const next1 = $("setup-next-1");
  if (next1) next1.onclick = () => showSetupStep(2);

  const back2 = $("setup-back-2");
  if (back2) back2.onclick = () => showSetupStep(1);

  const next2 = $("setup-next-2");
  if (next2) next2.onclick = () => showSetupStep(3);

  const back3 = $("setup-back-3");
  if (back3) back3.onclick = () => showSetupStep(2);

  const addCat = $("setup-add-category");
  if (addCat) addCat.onclick = () => {
    const input = $("setup-category-input");
    const v = (input?.value || "").trim();
    if (!v) return;

    const t = getData(KEY.workTemplates, {});
    if (!t[v]) t[v] = [];
    setData(KEY.workTemplates, t);
    if (input) input.value = "";

    renderSetupTemplates();
  };

  const addTask = $("setup-add-task");
  if (addTask) addTask.onclick = () => {
    const sel = $("setup-category-select");
    const cat = sel?.value;
    const input = $("setup-task-input");
    const v = (input?.value || "").trim();
    if (!cat || !v) return;

    const t = getData(KEY.workTemplates, {});
    if (!t[cat]) t[cat] = [];
    if (!t[cat].includes(v)) t[cat].push(v);
    setData(KEY.workTemplates, t);
    if (input) input.value = "";

    renderSetupTemplatesTaskList(cat);
  };

  const finish = $("setup-finish");
  if (finish) finish.onclick = () => {
    setData(KEY.setupDone, true);
    showApp();
    switchTab("day");
    renderAll();
  };
}

function renderSetupAll() {
  renderSetupSubjects();
  renderSetupSchoolDays();
  renderSetupTemplates();
}

function showSetupStep(n) {
  state.setupStep = n;
  document.querySelectorAll(".setup-step").forEach((s) => hide(s));
  const cur = document.querySelector(`.setup-step[data-step="${n}"]`);
  show(cur);
  setText("setup-progress", `${n} / 3`);
}

function renderSetupSubjects() {
  const list = $("setup-subject-list");
  if (!list) return;
  list.innerHTML = "";

  getData(KEY.subjects, []).forEach((s) => {
    const c = document.createElement("button");
    c.className = "chip";
    c.innerHTML = `${esc(s)} <span class="x">✕</span>`;
    c.onclick = () => {
      setData(KEY.subjects, getData(KEY.subjects, []).filter((x) => x !== s));
      renderSetupSubjects();
    };
    list.appendChild(c);
  });
}

function renderSetupSchoolDays() {
  const g = $("setup-schooldays");
  if (!g) return;
  g.innerHTML = "";

  const d = getData(KEY.schoolDays, []);
  WEEKDAYS.forEach((w) => {
    const b = document.createElement("button");
    b.className = "weekday " + (d.includes(w.id) ? "active" : "");
    b.textContent = w.l;
    b.onclick = () => {
      const x = getData(KEY.schoolDays, []);
      const i = x.indexOf(w.id);
      (i >= 0) ? x.splice(i, 1) : x.push(w.id);
      setData(KEY.schoolDays, x);
      renderSetupSchoolDays();
    };
    g.appendChild(b);
  });
}

function renderSetupTemplates() {
  const t = getData(KEY.workTemplates, {});
  const sel = $("setup-category-select");
  if (!sel) return;

  sel.innerHTML = "";
  Object.keys(t).sort().forEach((c) => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  });

  if (!sel.value && sel.options.length) sel.value = sel.options[0].value;

  renderSetupTemplatesTaskList(sel.value);
  sel.onchange = (e) => renderSetupTemplatesTaskList(e.target.value);
}

function renderSetupTemplatesTaskList(cat) {
  const list = $("setup-task-list");
  if (!list) return;
  list.innerHTML = "";
  if (!cat) return;

  const t = getData(KEY.workTemplates, {});
  (t[cat] || []).forEach((task) => {
    const r = document.createElement("div");
    r.className = "list-row";
    r.innerHTML = `<div>${esc(task)}</div><button class="btn btn-ghost" type="button">✕</button>`;
    r.querySelector("button").onclick = () => {
      const x = getData(KEY.workTemplates, {});
      x[cat] = (x[cat] || []).filter((z) => z !== task);
      setData(KEY.workTemplates, x);
      renderSetupTemplatesTaskList(cat);
    };
    list.appendChild(r);
  });
}

/* =========================
   DARK / LIGHT
========================= */
function applyDark() {
  document.body.classList.toggle("light", !getData(KEY.darkMode, true));
}
