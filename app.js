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
const SUPABASE_URL = "https://epeqhchtatxgninetvid.supabase.co";
// Hinweis: Der API‑Schlüssel muss vom Benutzer eingefügt werden. Ohne gültigen Schlüssel
// funktioniert die Anmeldung nicht.
const SUPABASE_KEY = "<Schlüssel hier>";

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
  // Setup Workflow
  if ($("setup-to-step-2")) $("setup-to-step-2").onclick = () => { hide($("setup-step-1")); show($("setup-step-2")); };
  if ($("setup-to-step-3")) $("setup-to-step-3").onclick = () => { hide($("setup-step-2")); show($("setup-step-3")); };
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
  if ($("setup-add-category")) {
    $("setup-add-category").onclick = () => {
      const v = $("setup-category-input").value.trim();
      if (v) {
        const temps = getData(KEY.workTemplates, {});
        if (!temps[v]) temps[v] = [];
        setData(KEY.workTemplates, temps);
        $("setup-category-input").value = "";
        renderSetup();
      }
    };
  }
  if ($("setup-add-task")) {
    $("setup-add-task").onclick = () => {
      const cat = $("setup-category-select").value;
      const v = $("setup-task-input").value.trim();
      if (cat && v) {
        const temps = getData(KEY.workTemplates, {});
        if (!temps[cat]) temps[cat] = [];
        temps[cat].push(v);
        setData(KEY.workTemplates, temps);
        $("setup-task-input").value = "";
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
  // Logout und Reset
  if ($("logout-btn")) {
    $("logout-btn").onclick = async () => {
      await supabaseClient.auth.signOut();
      localStorage.clear();
      location.reload();
    };
  }
  if ($("reset-all")) {
    $("reset-all").onclick = () => {
      localStorage.clear();
      location.reload();
    };
  }
  // Einstellungen: Hinzufügen, Löschen und Auswahl
  if ($("settings-add-subject")) {
    $("settings-add-subject").onclick = () => {
      const val = $("settings-subject-input").value.trim();
      if (val) {
        const arr = getData(KEY.subjects, []);
        arr.push(val);
        setData(KEY.subjects, arr);
        $("settings-subject-input").value = "";
        renderSettingsSubjects();
        renderSchool();
        saveConfig();
      }
    };
  }
  if ($("settings-add-category")) {
    $("settings-add-category").onclick = () => {
      const val = $("settings-category-input").value.trim();
      if (val) {
        const temps = getData(KEY.workTemplates, {});
        if (!temps[val]) temps[val] = [];
        setData(KEY.workTemplates, temps);
        $("settings-category-input").value = "";
        renderSettingsCategories();
        renderWork();
        saveConfig();
      }
    };
  }
  if ($("settings-add-task")) {
    $("settings-add-task").onclick = () => {
      const catSel = $("settings-category-select");
      const val = $("settings-task-input").value.trim();
      const cat = catSel?.value;
      if (cat && val) {
        const temps = getData(KEY.workTemplates, {});
        if (!temps[cat]) temps[cat] = [];
        temps[cat].push(val);
        setData(KEY.workTemplates, temps);
        $("settings-task-input").value = "";
        renderSettingsCategories();
        renderWork();
        saveConfig();
      }
    };
  }
  // Navigationsbuttons im Report
  if ($("report-prev")) $("report-prev").onclick = () => { state.weekOff--; renderReport(); };
  if ($("report-next")) $("report-next").onclick = () => { state.weekOff++; renderReport(); };
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
    // Wir speichern sowohl die neuen (school_days, work_templates) als auch die alten Feldnamen
    // (schooldays, templates) ab, damit ältere Versionen der Datenbank weiterhin funktionieren.
    await supabaseClient.from("user_config").upsert({
      user_id: currentUser.id,
      subjects: getData(KEY.subjects, []),
      school_days: getData(KEY.days, [1, 2]),
      work_templates: getData(KEY.workTemplates, {}),
      // alte Feldnamen als Fallback
      schooldays: getData(KEY.days, [1, 2]),
      templates: getData(KEY.workTemplates, {})
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
      (temps[selectedCat] || []).forEach((t, idx) => {
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

function renderSettingsCategories() {
  const select = $("settings-category-select");
  const listDiv = $("settings-task-list");
  if (!select || !listDiv) return;
  const temps = getData(KEY.workTemplates, {});
  const categories = Object.keys(temps);
  select.innerHTML = "";
  categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  });
  select.onchange = () => {
    renderSettingsCategories();
  };
  listDiv.innerHTML = "";
  const cat = select.value || categories[0];
  if (cat) {
    (temps[cat] || []).forEach((task, idx) => {
      const chip = document.createElement("div");
      chip.className = "chip active";
      chip.textContent = task;
      chip.onclick = () => {
        temps[cat] = temps[cat].filter(x => x !== task);
        setData(KEY.workTemplates, temps);
        renderSettingsCategories();
        renderWork();
        saveConfig();
      };
      listDiv.appendChild(chip);
    });
  }
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
