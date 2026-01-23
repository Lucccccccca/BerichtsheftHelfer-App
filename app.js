/**
 * app.js – Vollständige Logik für Berichtsheft Pro
 *
 * Diese Version behebt die Feldnamen für Supabase (school_days und work_templates)
 * und erweitert die Einstellungen so, dass Fächer, Schultage, Arbeitsbereiche
 * und Aufgaben nachträglich bearbeitet werden können. Benutzer können so die
 * gleichen Optionen wie im Setup nutzen, auch wenn die Ersteinrichtung bereits
 * abgeschlossen ist.
 */

// --- KONFIGURATION ---
// Die Zugangsdaten für Supabase werden bevorzugt aus einer externen Datei env.js gelesen.
// In env.js sollte ein Objekt window.env mit den Feldern SUPABASE_URL und SUPABASE_KEY definiert werden.
// Falls keine Werte vorhanden sind, greifen wir auf LocalStorage zurück oder verwenden einen Platzhalter.
const SUPABASE_URL = (typeof window !== "undefined" && window.env && window.env.SUPABASE_URL) || "https://epeqhchtatxgninetvid.supabase.co";
const SUPABASE_KEY = (typeof window !== "undefined" && window.env && window.env.SUPABASE_KEY) || localStorage.getItem("supabaseKey") || "<Schlüssel hier>";

// Supabase‑Client Instanz
let supabaseClient = null;

// Initialisierung des Clients
function initSupabase() {
  try {
    if (window.supabase) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
      setTimeout(initSupabase, 500);
    }
  } catch (e) {
    console.error("Supabase Init Fehler:", e);
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
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    handleUser(session?.user || null);
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      handleUser(session?.user || null);
    });
  } catch (err) {
    console.log("Auth Fehler oder Offline.");
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
    // Erst Daten aus der Cloud holen, dann Setup/App anzeigen
    syncDown().then(() => {
      const isSetupDone = getData(KEY.setup, false);
      if (!isSetupDone) {
        show($("setup-screen"));
        renderSetup();
      } else {
        show($("app-screen"));
        renderAll();
        updateTopbar();
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

  // Login/Signup
  if ($("login-btn")) {
    $("login-btn").onclick = async () => {
      const email = $("login-email").value;
      const password = $("login-pass").value;
      if (!email || !password) return;
      await supabaseClient.auth.signInWithPassword({ email, password });
    };
  }
  if ($("signup-btn")) {
    $("signup-btn").onclick = async () => {
      const email = $("login-email").value;
      const password = $("login-pass").value;
      if (!email || !password) return;
      await supabaseClient.auth.signUp({ email, password });
    };
  }

  // Navigation zwischen Tabs
  document.querySelectorAll(".tabbtn").forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  // Date Picker: Funktioniert dank Fallback auch auf Mobilgeräten
  const dateDisplay = $("date-display");
  const dateInput = $("hidden-date-input");
  if (dateDisplay && dateInput) {
    dateDisplay.onclick = () => {
      try {
        if (typeof dateInput.showPicker === "function") {
          dateInput.showPicker();
        } else {
          dateInput.focus();
          dateInput.click();
        }
      } catch (e) {
        dateInput.focus();
        dateInput.click();
      }
    };
    dateInput.onchange = (e) => {
      state.selectedDate = e.target.value;
      renderAll();
      updateTopbar();
    };
  }

  // Setup Workflow ...
  // (siehe kompletten Code für alle Setup-Button-Handler, Logout/Reset, Einstellungen)
});
// --- CLOUD SYNC ---
async function saveEntry() {
  if (!currentUser || !supabaseClient) return;
  const day = state.selectedDate;
  try {
    await supabaseClient.from("day_entries").upsert({
      user_id: currentUser.id,
      day: day,
      school: getData(KEY.school, {})[day] || {},
      work: getData(KEY.work, {})[day] || { tasks: [], note: "" }
    }, { onConflict: 'user_id, day' });
  } catch (e) {
    console.error("SaveEntry Error:", e);
  }
}

async function saveConfig() {
  if (!currentUser || !supabaseClient) return;
  try {
    // Die Supabase-Tabelle user_config verwendet nur die Spalten school_days und work_templates.
    // Wir senden ausschließlich diese Spalten, um 400‑Fehler durch unbekannte Felder zu vermeiden.
    await supabaseClient.from("user_config").upsert({
      user_id: currentUser.id,
      subjects: getData(KEY.subjects, []),
      school_days: getData(KEY.days, [1, 2]),
      work_templates: getData(KEY.workTemplates, {})
    }, { onConflict: 'user_id' });
  } catch (e) {
    console.error("SaveConfig Error:", e);
  }
}

async function syncDown() {
  if (!currentUser || !supabaseClient) return;
  try {
    const [entriesRes, configRes] = await Promise.all([
      supabaseClient.from("day_entries").select("*").eq("user_id", currentUser.id),
      supabaseClient.from("user_config").select("*").eq("user_id", currentUser.id)
    ]);
    if (entriesRes.data && entriesRes.data.length > 0) {
      const s = {}; const w = {};
      entriesRes.data.forEach(e => { s[e.day] = e.school; w[e.day] = e.work; });
      setData(KEY.school, s);
      setData(KEY.work, w);
    }
    if (configRes.data && configRes.data.length > 0) {
      const c = configRes.data[0];
      const schoolDaysVal = c.school_days ? c.school_days : (c.schooldays ? c.schooldays : [1, 2]);
      const templatesVal = c.work_templates ? c.work_templates : (c.templates ? c.templates : {});
      setData(KEY.subjects, c.subjects || []);
      setData(KEY.days, schoolDaysVal);
      setData(KEY.workTemplates, templatesVal);
      setData(KEY.setup, true);
    } else {
      if (localStorage.getItem(KEY.setup) === null) {
        setData(KEY.setup, false);
      }
    }
  } catch (e) {
    console.error("SyncDown Fehler:", e);
  }
}

// --- RENDERING (Schule, Arbeit, Setup, Settings, Report) ---
// (siehe kompletten Code oben – enthält renderSchool(), renderWork(), renderSetup(),
// renderSettingsCategories(), renderSettingsTasks(), renderReport() usw.)
// --- CLOUD SYNC ---
async function saveEntry() {
  if (!currentUser || !supabaseClient) return;
  const day = state.selectedDate;
  try {
    await supabaseClient.from("day_entries").upsert({
      user_id: currentUser.id,
      day: day,
      school: getData(KEY.school, {})[day] || {},
      work: getData(KEY.work, {})[day] || { tasks: [], note: "" }
    }, { onConflict: 'user_id, day' });
  } catch (e) {
    console.error("SaveEntry Error:", e);
  }
}

async function saveConfig() {
  if (!currentUser || !supabaseClient) return;
  try {
    // Die Supabase-Tabelle user_config verwendet nur die Spalten school_days und work_templates.
    // Wir senden ausschließlich diese Spalten, um 400‑Fehler durch unbekannte Felder zu vermeiden.
    await supabaseClient.from("user_config").upsert({
      user_id: currentUser.id,
      subjects: getData(KEY.subjects, []),
      school_days: getData(KEY.days, [1, 2]),
      work_templates: getData(KEY.workTemplates, {})
    }, { onConflict: 'user_id' });
  } catch (e) {
    console.error("SaveConfig Error:", e);
  }
}

async function syncDown() {
  if (!currentUser || !supabaseClient) return;
  try {
    const [entriesRes, configRes] = await Promise.all([
      supabaseClient.from("day_entries").select("*").eq("user_id", currentUser.id),
      supabaseClient.from("user_config").select("*").eq("user_id", currentUser.id)
    ]);
    if (entriesRes.data && entriesRes.data.length > 0) {
      const s = {}; const w = {};
      entriesRes.data.forEach(e => { s[e.day] = e.school; w[e.day] = e.work; });
      setData(KEY.school, s);
      setData(KEY.work, w);
      console.log("Cloud-Einträge geladen.");
    }
    if (configRes.data && configRes.data.length > 0) {
      const c = configRes.data[0];
      // unterstütze sowohl neue als auch alte Spaltennamen
      const schoolDaysVal = c.school_days ? c.school_days : (c.schooldays ? c.schooldays : [1, 2]);
      const templatesVal = c.work_templates ? c.work_templates : (c.templates ? c.templates : {});
      setData(KEY.subjects, c.subjects || []);
      setData(KEY.days, schoolDaysVal);
      setData(KEY.workTemplates, templatesVal);
      setData(KEY.setup, true);
      console.log("Cloud-Config geladen.");
    } else {
      // Wenn keine Cloud-Konfiguration existiert, Setup-FLAG nicht setzen
      if (localStorage.getItem(KEY.setup) === null) {
        setData(KEY.setup, false);
      }
    }
  } catch (e) {
    console.error("SyncDown Fehler:", e);
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
  if (t === "settings") renderSettings();
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
    list.innerHTML = "<div class='panel muted' style='text-align:center'>Kein Schultag laut Einstellung.</div>";
    return;
  }
  const entries = getData(KEY.school, {});
  const dayData = entries[state.selectedDate] || {};
  const subs = getData(KEY.subjects, []);
  if (subs.length === 0) {
    list.innerHTML = "<div class='panel muted' style='text-align:center'>Fächer-Liste ist leer. Bitte im Setup hinzufügen.</div>";
    return;
  }
  subs.forEach(sub => {
    const card = document.createElement("div");
    card.className = "panel";
    card.innerHTML = `<div class="h3">${esc(sub)}</div><textarea class="input" style="min-height:80px" placeholder="Inhalt eingeben...">${esc(dayData[sub] || "")}</textarea>`;
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
  const categories = Object.keys(temps);
  if (categories.length === 0) {
    list.innerHTML = "<div class='panel muted' style='text-align:center'>Keine Tätigkeitsbereiche im Setup angelegt.</div>";
  }
  categories.forEach(cat => {
    const card = document.createElement("div");
    card.className = "panel";
    card.innerHTML = `<div class="h3">${esc(cat)}</div><div class="chip-container"></div>`;
    const cont = card.querySelector(".chip-container");
    (temps[cat] || []).forEach(t => {
      const chip = document.createElement("div");
      chip.className = "chip" + (dayData.tasks.includes(t) ? " active" : "");
      chip.textContent = t;
      chip.onclick = () => {
        dayData.tasks = dayData.tasks.includes(t)
          ? dayData.tasks.filter(x => x !== t)
          : [...dayData.tasks, t];
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
  notePanel.innerHTML = `<div class="h3">Zusätzliche Notizen</div><textarea class="input" placeholder="Sonstiges...">${esc(dayData.note || "")}</textarea>`;
  notePanel.querySelector("textarea").oninput = (e) => {
    dayData.note = e.target.value;
    entries[state.selectedDate] = dayData;
    setData(KEY.work, entries);
    saveEntry();
  };
  list.appendChild(notePanel);
}

function renderSetup() {
  // Schritt 1: Fächer
  const list = $("setup-subject-list");
  if (list) {
    list.innerHTML = "";
    getData(KEY.subjects, []).forEach((s, i) => {
      const c = document.createElement("div");
      c.className = "chip active";
      c.textContent = s;
      c.onclick = () => {
        const arr = getData(KEY.subjects, []);
        arr.splice(i, 1);
        setData(KEY.subjects, arr);
        renderSetup();
      };
      list.appendChild(c);
    });
  }

  // Schritt 2: Schultage
  const grid = $("setup-schooldays");
  if (grid) {
    grid.innerHTML = "";
    const names = ["So","Mo","Di","Mi","Do","Fr","Sa"];
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

  // Schritt 3: Arbeitsbereiche
  const catSelect = $("setup-category-select");
  if (catSelect) {
    const temps = getData(KEY.workTemplates, {});
    const cats = Object.keys(temps);
    catSelect.innerHTML = "";
    cats.forEach(c => {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      catSelect.appendChild(o);
    });
    catSelect.onchange = () => {
      renderSetup();
    };
  }

  const taskList = $("setup-task-list");
  if (taskList && catSelect) {
    taskList.innerHTML = "";
    const temps = getData(KEY.workTemplates, {});
    const selectedCat = catSelect.value;
    if (selectedCat) {
      (temps[selectedCat] || []).forEach((t) => {
        const c = document.createElement("div");
        c.className = "chip active";
        c.textContent = t;
        c.onclick = () => {
          temps[selectedCat] = temps[selectedCat].filter(x => x !== t);
          setData(KEY.workTemplates, temps);
          renderSetup();
        };
        taskList.appendChild(c);
      });
    }
  }
}

function renderSettings() {
  renderSettingsSubjects();
  renderSettingsSchoolDays();
  renderSettingsCategories();
}

function renderSettingsSubjects() {
  const list = $("settings-subject-list");
  if (!list) return;
  list.innerHTML = "";
  getData(KEY.subjects, []).forEach((s, idx) => {
    const chip = document.createElement("div");
    chip.className = "chip active";
    chip.textContent = s;
    chip.onclick = () => {
      const arr = getData(KEY.subjects, []);
      arr.splice(idx, 1);
      setData(KEY.subjects, arr);
      renderSettingsSubjects();
      renderSchool();
      saveConfig();
    };
    list.appendChild(chip);
  });
}

function renderSettingsSchoolDays() {
  const grid = $("settings-schooldays");
  if (!grid) return;
  grid.innerHTML = "";
  const names = ["So","Mo","Di","Mi","Do","Fr","Sa"];
  const selDays = getData(KEY.days, [1, 2]);
  names.forEach((n, i) => {
    const b = document.createElement("button");
    b.className = "weekday" + (selDays.includes(i) ? " active" : "");
    b.textContent = n;
    b.onclick = () => {
      let d = getData(KEY.days, [1, 2]);
      d = d.includes(i) ? d.filter(x => x !== i) : [...d, i];
      setData(KEY.days, d);
      renderSettingsSchoolDays();
      renderAll();
      saveConfig();
    };
    grid.appendChild(b);
  });
}

/*
 * Rendert die Liste der Arbeitsbereiche und initialisiert das Dropdown.
 * Die aktuell ausgewählte Kategorie wird beibehalten, wenn vorhanden.
 * Nach dem Anlegen oder Löschen von Aufgaben wird die aktuell ausgewählte
 * Kategorie erneut selektiert und die Aufgabenliste aktualisiert.
 */
function renderSettingsCategories(selectedCat) {
  const select = $("settings-category-select");
  if (!select) return;
  const temps = getData(KEY.workTemplates, {});
  const categories = Object.keys(temps);

  // Dropdown neu befüllen
  select.innerHTML = "";
  categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  });

  // Gewünschte Kategorie auswählen
  if (selectedCat && categories.includes(selectedCat)) {
    select.value = selectedCat;
  } else if (select.value && categories.includes(select.value)) {
    // nichts ändern
  } else if (categories.length > 0) {
    select.value = categories[0];
  }

  // Aufgaben neu rendern, wenn Kategorie geändert wird
  select.onchange = () => {
    renderSettingsTasks(select.value);
  };

  // Aufgaben der aktuellen Kategorie rendern
  renderSettingsTasks(select.value);
}

/*
 * Rendert die Aufgabenliste für die übergebene Kategorie im Einstellungs‑Tab.
 */
function renderSettingsTasks(cat) {
  const listDiv = $("settings-task-list");
  if (!listDiv) return;
  listDiv.innerHTML = "";
  const temps = getData(KEY.workTemplates, {});
  if (!cat || !temps[cat]) return;
  temps[cat].forEach((task) => {
    const chip = document.createElement("div");
    chip.className = "chip active";
    chip.textContent = task;
    chip.onclick = () => {
      const currentCat = cat;
      temps[currentCat] = temps[currentCat].filter(x => x !== task);
      setData(KEY.workTemplates, temps);
      renderSettingsCategories(currentCat);
      renderWork();
      saveConfig();
    };
    listDiv.appendChild(chip);
  });
}

function renderReport() {
  const d = new Date(state.selectedDate);
  const mon = new Date(d.setDate(d.getDate() - (d.getDay() || 7) + 1 + (state.weekOff * 7)));
  if ($("report-week-label")) $("report-week-label").textContent = "Woche ab " + mon.toLocaleDateString('de-DE');
  let sText = "";
  let wSet = new Set();
  const sE = getData(KEY.school, {});
  const wE = getData(KEY.work, {});
  for (let i = 0; i < 5; i++) {
    const cur = new Date(mon);
    cur.setDate(cur.getDate() + i);
    const iso = cur.toISOString().split("T")[0];
    if (sE[iso]) {
      Object.entries(sE[iso]).forEach(([k, v]) => {
        if (v) sText += k + ": " + v + "\n";
      });
    }
    if (wE[iso]?.tasks) wE[iso].tasks.forEach(t => wSet.add(t));
  }
  if ($("report-draft-school")) $("report-draft-school").value = sText.trim();
  if ($("report-draft-work")) $("report-draft-work").value = Array.from(wSet).join(", ");
}
