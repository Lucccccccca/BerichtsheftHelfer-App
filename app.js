/**
 * app.js - Vollständige Logik für Berichtsheft Pro
 * Inklusive Bereichs-Management (Kategorien hinzufügen/löschen)
 */

// --- KONFIGURATION ---
const SUPABASE_URL = "https://epeqhchtatxgninetvid.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZXFoY2h0YXR4Z25pbmV0dmlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTIyNTIsImV4cCI6MjA4NDQyODI1Mn0.5yNc888ypwrAcUGvSZM8CfssRMbcovBFyltkSx6fErA";

// Sicherstellen, dass supabase geladen ist, bevor der Client erstellt wird
let supabaseClient;
try {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } else {
    console.error("Supabase Library nicht gefunden! Bitte Internetverbindung prüfen.");
  }
} catch (e) {
  console.error("Supabase konnte nicht initialisiert werden:", e);
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
  } catch (e) {
    return fb;
  }
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
    const { data: { session } } = await supabaseClient.auth.getSession();
    handleUser(session?.user || null);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      handleUser(session?.user || null);
    });
  } catch (err) {
    console.error("Auth Session Error:", err);
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
    if (!getData(KEY.setup, false)) {
      show($("setup-screen"));
      renderSetup();
    } else {
      show($("app-screen"));
      syncDown().then(() => {
        renderAll();
        switchTab("day");
      });
    }
  }
}

// --- INITIALISIERUNG ---
document.addEventListener("DOMContentLoaded", () => {
  initAuth();
  applyTheme();

  // Login & Signup
  if ($("login-btn")) {
    $("login-btn").onclick = async () => {
      const email = $("login-email").value;
      const password = $("login-pass").value;
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) alert("Login fehlgeschlagen: " + error.message);
    };
  }

  if ($("signup-btn")) {
    $("signup-btn").onclick = async () => {
      const email = $("login-email").value;
      const password = $("login-pass").value;
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) alert(error.message); else alert("Bitte E-Mails prüfen!");
    };
  }

  // Navigation
  document.querySelectorAll(".tabbtn").forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  // Date Picker
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

  // --- SETUP LOGIK ---
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

  if ($("setup-to-step-2")) $("setup-to-step-2").onclick = () => { hide($("setup-step-1")); show($("setup-step-2")); };
  if ($("setup-to-step-3")) $("setup-to-step-3").onclick = () => { hide($("setup-step-2")); show($("setup-step-3")); renderSetupTemplates(); };

  // Setup: Bereich hinzufügen
  if ($("setup-add-category")) {
    $("setup-add-category").onclick = () => {
      const cat = $("setup-category-input").value.trim();
      if (cat) {
        const t = getData(KEY.workTemplates, {});
        if (!t[cat]) {
          t[cat] = [];
          setData(KEY.workTemplates, t);
          $("setup-category-input").value = "";
          renderSetupTemplates();
          if ($("setup-category-select")) $("setup-category-select").value = cat;
          renderSetupTemplatesTaskList(cat);
        }
      }
    };
  }

  if ($("setup-add-task")) {
    $("setup-add-task").onclick = () => {
      const cat = $("setup-category-select").value;
      const task = $("setup-task-input").value.trim();
      if (cat && task) {
        const t = getData(KEY.workTemplates, {});
        if (!t[cat]) t[cat] = [];
        t[cat].push(task);
        setData(KEY.workTemplates, t);
        $("setup-task-input").value = "";
        renderSetupTemplatesTaskList(cat);
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

  // --- SETTINGS LOGIK ---
  if ($("settings-add-category")) {
    $("settings-add-category").onclick = () => {
      const cat = $("settings-category-input").value.trim();
      if (cat) {
        const t = getData(KEY.workTemplates, {});
        if (!t[cat]) {
          t[cat] = [];
          setData(KEY.workTemplates, t);
          $("settings-category-input").value = "";
          renderSettingsTemplates();
          if ($("settings-category-select")) $("settings-category-select").value = cat;
          renderSettingsTaskList(cat);
          saveConfig();
        }
      }
    };
  }

  if ($("settings-add-task")) {
    $("settings-add-task").onclick = () => {
      const cat = $("settings-category-select").value;
      const task = $("settings-task-input").value.trim();
      if (cat && task) {
        const t = getData(KEY.workTemplates, {});
        if (!t[cat]) t[cat] = [];
        t[cat].push(task);
        setData(KEY.workTemplates, t);
        $("settings-task-input").value = "";
        renderSettingsTaskList(cat);
        saveConfig();
      }
    };
  }

  if ($("logout-btn")) {
    $("logout-btn").onclick = async () => {
      await supabaseClient.auth.signOut();
      localStorage.clear();
      location.reload();
    };
  }

  if ($("reset-all")) {
    $("reset-all").onclick = () => {
      if (confirm("Alles löschen?")) {
        localStorage.clear();
        location.reload();
      }
    };
  }

  if ($("report-prev")) $("report-prev").onclick = () => { state.weekOff--; renderReport(); };
  if ($("report-next")) $("report-next").onclick = () => { state.weekOff++; renderReport(); };
});

// --- RENDERING ---
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

  document.querySelectorAll(".tabbtn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === t);
  });

  if (t === "report") renderReport();
  if (t === "settings") renderSettingsTemplates();
  if (t === "day") renderAll();
  updateTopbar();
}

function isSchoolDay() {
  const d = new Date(state.selectedDate).getDay();
  return getData(KEY.days, [1, 2]).includes(d);
}

function renderAll() {
  renderSchool();
  renderWork();
}

function renderSchool() {
  const list = $("school-list");
  if (!list) return;
  list.innerHTML = "";
  if (!isSchoolDay()) {
    list.innerHTML = "<div class='panel muted' style='text-align:center'>Kein Schultag.</div>";
    return;
  }
  const entries = getData(KEY.school, {});
  const dayData = entries[state.selectedDate] || {};
  getData(KEY.subjects, []).forEach(sub => {
    const card = document.createElement("div");
    card.className = "panel";
    card.innerHTML = `<div class="h3">${esc(sub)}</div><textarea class="input" style="min-height:80px">${esc(dayData[sub] || "")}</textarea>`;
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
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div class="h3">${esc(cat)}</div>
        <button class="btn-ghost" style="width:auto; padding:4px 8px" onclick="addInlineTask('${esc(cat)}')">＋</button>
      </div>
      <div class="chip-container"></div>
    `;
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
  notePanel.innerHTML = `<div class="h3">Zusätzliche Notizen</div><textarea class="input">${esc(dayData.note || "")}</textarea>`;
  notePanel.querySelector("textarea").oninput = (e) => {
    dayData.note = e.target.value;
    entries[state.selectedDate] = dayData;
    setData(KEY.work, entries);
    saveEntry();
  };
  list.appendChild(notePanel);
}

window.addInlineTask = (cat) => {
  const t = prompt("Neue Aufgabe für '" + cat + "':");
  if (t && t.trim()) {
    const temps = getData(KEY.workTemplates, {});
    if (!temps[cat]) temps[cat] = [];
    temps[cat].push(t.trim());
    setData(KEY.workTemplates, temps);
    renderWork();
    saveConfig();
  }
};

// --- RENDER HELPERS ---
function renderSetupTemplates() {
  const t = getData(KEY.workTemplates, {});
  const sel = $("setup-category-select");
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = "";
  Object.keys(t).forEach(k => {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    sel.appendChild(o);
  });
  if (currentVal && t[currentVal]) sel.value = currentVal;
  if (sel.value) renderSetupTemplatesTaskList(sel.value);
  sel.onchange = (e) => renderSetupTemplatesTaskList(e.target.value);
}

function renderSetupTemplatesTaskList(cat) {
  const list = $("setup-task-list");
  if (!list) return;
  list.innerHTML = "";
  if (!cat) return;
  const t = getData(KEY.workTemplates, {});
  (t[cat] || []).forEach(x => {
    const r = document.createElement("div");
    r.className = "list-row";
    r.style = "display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line)";
    r.innerHTML = `<span>${esc(x)}</span><span style="color:var(--danger); cursor:pointer">✕</span>`;
    r.lastChild.onclick = () => {
      t[cat] = t[cat].filter(y => y !== x);
      setData(KEY.workTemplates, t);
      renderSetupTemplatesTaskList(cat);
    };
    list.appendChild(r);
  });
}

function renderSettingsTemplates() {
  const t = getData(KEY.workTemplates, {});
  const sel = $("settings-category-select");
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = "";
  Object.keys(t).forEach(k => {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    sel.appendChild(o);
  });
  if (currentVal && t[currentVal]) sel.value = currentVal;
  if (sel.value) renderSettingsTaskList(sel.value);
  sel.onchange = (e) => renderSettingsTaskList(e.target.value);
}

function renderSettingsTaskList(cat) {
  const list = $("settings-task-list");
  if (!list) return;
  list.innerHTML = "";
  if (!cat) return;
  const t = getData(KEY.workTemplates, {});
  
  const delCatBtn = document.createElement("button");
  delCatBtn.className = "btn btn-danger";
  delCatBtn.style = "margin-bottom: 15px; font-size: 0.8rem; padding: 8px; width: 100%";
  delCatBtn.textContent = "Gesamten Bereich '" + cat + "' löschen";
  delCatBtn.onclick = () => {
    if(confirm("Diesen Bereich wirklich entfernen?")) {
      delete t[cat];
      setData(KEY.workTemplates, t);
      renderSettingsTemplates();
      saveConfig();
    }
  };
  list.appendChild(delCatBtn);

  (t[cat] || []).forEach(x => {
    const r = document.createElement("div");
    r.className = "list-row";
    r.style = "display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--line)";
    r.innerHTML = `<span>${esc(x)}</span><button class="btn-ghost" style="width:auto;color:var(--danger)">✕</button>`;
    r.querySelector("button").onclick = () => {
      t[cat] = t[cat].filter(y => y !== x);
      setData(KEY.workTemplates, t);
      renderSettingsTaskList(cat);
      saveConfig();
    };
    list.appendChild(r);
  });
}

function renderReport() {
  const d = new Date(state.selectedDate);
  const mon = new Date(d.setDate(d.getDate() - (d.getDay() || 7) + 1 + (state.weekOff * 7)));
  if ($("report-week-label")) $("report-week-label").textContent = "Bericht ab " + mon.toLocaleDateString('de-DE');
  
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

function renderSetup() {
  const list = $("setup-subject-list");
  if (!list) return;
  list.innerHTML = "";
  getData(KEY.subjects, []).forEach(s => {
    const c = document.createElement("div");
    c.className = "chip active";
    c.textContent = s;
    list.appendChild(c);
  });

  const grid = $("setup-schooldays");
  if (!grid) return;
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

// --- CLOUD SYNC ---
async function saveEntry() {
  if (!currentUser || !supabaseClient) return;
  try {
    const day = state.selectedDate;
    await supabaseClient.from("day_entries").upsert({
      user_id: currentUser.id,
      day: day,
      school: getData(KEY.school, {})[day] || {},
      work: getData(KEY.work, {})[day] || { tasks: [], note: "" }
    });
  } catch (e) { console.error("SaveEntry Error:", e); }
}

async function saveConfig() {
  if (!currentUser || !supabaseClient) return;
  try {
    await supabaseClient.from("user_configs").upsert({
      user_id: currentUser.id,
      subjects: getData(KEY.subjects, []),
      schooldays: getData(KEY.days, [1, 2]),
      templates: getData(KEY.workTemplates, {})
    });
  } catch (e) { console.error("SaveConfig Error:", e); }
}

async function syncDown() {
  if (!currentUser || !supabaseClient) return;
  
  try {
    const { data: entries, error: e1 } = await supabaseClient.from("day_entries").select("*").eq("user_id", currentUser.id);
    if (!e1 && entries && entries.length > 0) {
      const s = getData(KEY.school, {}); const w = getData(KEY.work, {});
      entries.forEach(e => { s[e.day] = e.school; w[e.day] = e.work; });
      setData(KEY.school, s); setData(KEY.work, w);
    }
    
    const { data: config, error: e2 } = await supabaseClient.from("user_configs").select("*").eq("user_id", currentUser.id).maybeSingle();
    if (!e2 && config) {
      setData(KEY.subjects, config.subjects || []);
      setData(KEY.days, config.schooldays || [1, 2]);
      setData(KEY.workTemplates, config.templates || {});
      if (config.subjects?.length > 0) setData(KEY.setup, true);
    }
  } catch (e) {
    console.error("Fehler beim SyncDown:", e);
  }
}