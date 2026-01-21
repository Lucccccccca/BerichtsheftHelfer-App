/* =========================================================
   app.js — VOLLSTÄNDIGE VERSION (Teil 1)
   ========================================================= */

const SUPABASE_URL = "https://epeqhchtatxgninetvid.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZXFoY2h0YXR4Z25pbmV0dmlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTIyNTIsImV4cCI6MjA4NDQyODI1Mn0.5yNc888ypwrAcUGvSZM8CfssRMbcovBFyltkSx6fErA";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

const $ = (id) => document.getElementById(id);
const show = (el) => el && el.classList.remove("hidden");
const hide = (el) => el && el.classList.add("hidden");
const getData = (k, fb) => JSON.parse(localStorage.getItem(k) || JSON.stringify(fb));
const setData = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const esc = (t) => { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; };

// App Start
document.addEventListener("DOMContentLoaded", async () => {
  applyDark();
  
  const { data: { session } } = await supabaseClient.auth.getSession();
  handleAuthState(session?.user || null);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    handleAuthState(session?.user || null);
  });

  initEventListeners();
});

function handleAuthState(user) {
  currentUser = user;
  if (!user) {
    show($("login-screen"));
    hide($("app-screen"));
    hide($("setup-screen"));
  } else {
    hide($("login-screen"));
    if (!getData(KEY.setup, false)) {
      show($("setup-screen"));
      renderSetup();
      renderSetupTemplates();
    } else {
      show($("app-screen"));
      syncDown().then(() => {
        renderAll();
        switchTab(isSchoolDay() ? "school" : "work");
      });
    }
  }
}

function applyDark() {
  const isDark = getData(KEY.dark, true);
  document.body.classList.toggle("light", !isDark);
  if ($("dark-toggle")) $("dark-toggle").checked = isDark;
}

function initEventListeners() {
  // Login
  $("login-btn").onclick = async () => {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: $("login-email").value,
      password: $("login-pass").value
    });
    if (error) alert("Fehler: " + error.message);
  };

  // Registrierung
  $("signup-btn").onclick = async () => {
    const { error } = await supabaseClient.auth.signUp({
      email: $("login-email").value,
      password: $("login-pass").value
    });
    if (error) alert(error.message); else alert("Bitte Email bestätigen!");
  };

  // Tabs Navigation
  document.querySelectorAll(".tabbtn").forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  // Datum ändern
  $("hidden-date-input").onchange = (e) => {
    state.selectedDate = e.target.value;
    renderAll();
    switchTab(isSchoolDay() ? "school" : "work");
  };

  // Setup Fächer
  $("setup-add-subject").onclick = () => {
    const v = $("setup-subject-input").value.trim();
    if(v) { 
      const s = getData(KEY.subjects, []); s.push(v); 
      setData(KEY.subjects, s); $("setup-subject-input").value=""; renderSetup(); 
    }
  };

  $("setup-to-step-2").onclick = () => { hide($("setup-step-1")); show($("setup-step-2")); };
  $("setup-to-step-3").onclick = () => { hide($("setup-step-2")); show($("setup-step-3")); renderSetupTemplates(); };

  // Setup Kategorien & Aufgaben
  $("setup-add-category").onclick = () => {
    const cat = $("setup-category-input").value.trim();
    if (cat) {
      const t = getData(KEY.workTemplates, {});
      if (!t[cat]) t[cat] = [];
      setData(KEY.workTemplates, t);
      $("setup-category-input").value = "";
      renderSetupTemplates();
    }
  };

  $("setup-add-task").onclick = () => {
    const cat = $("setup-category-select").value;
    const task = $("setup-task-input").value.trim();
    if (cat && task) {
      const t = getData(KEY.workTemplates, {});
      t[cat].push(task);
      setData(KEY.workTemplates, t);
      $("setup-task-input").value = "";
      renderSetupTemplatesTaskList(cat);
    }
  };

  $("setup-finish").onclick = () => {
    setData(KEY.setup, true);
    location.reload();
  };

  // Einstellungen
  $("dark-toggle").onchange = (e) => { setData(KEY.dark, e.target.checked); applyDark(); };
  $("reset-all").onclick = () => { if(confirm("Alles löschen?")) { localStorage.clear(); location.reload(); } };
  
  // Berichts-Navigation
  $("report-prev").onclick = () => { state.weekOff--; renderReport(); };
  $("report-next").onclick = () => { state.weekOff++; renderReport(); };
}
/* =========================================================
   app.js — VOLLSTÄNDIGE VERSION (Teil 2)
   ========================================================= */

function isSchoolDay() {
  const d = new Date(state.selectedDate).getDay();
  return getData(KEY.days, [1, 2]).includes(d);
}

function switchTab(t) {
  document.querySelectorAll(".tab-content").forEach(c => hide(c));
  const target = $("tab-" + t);
  if (target) show(target);
  document.querySelectorAll(".tabbtn").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  if (t === "report") renderReport();
  updateTopbar();
}

function updateTopbar() {
  const d = new Date(state.selectedDate);
  const options = { weekday: 'short', day: '2-digit', month: '2-digit' };
  $("topbar-title").textContent = d.toLocaleDateString('de-DE', options);
}

function renderAll() {
  renderSchool();
  renderWork();
}

function renderSchool() {
  const list = $("school-list");
  if(!list) return;
  list.innerHTML = "";
  if (!isSchoolDay()) {
    list.innerHTML = "<div class='panel muted'>Kein Schultag laut Plan.</div>";
    return;
  }
  const entries = getData(KEY.school, {});
  const dayData = entries[state.selectedDate] || {};
  const subjects = getData(KEY.subjects, []);

  subjects.forEach(sub => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="h3">${esc(sub)}</div><textarea class="textarea" placeholder="..."> ${esc(dayData[sub] || "")}</textarea>`;
    card.querySelector("textarea").oninput = (e) => {
      dayData[sub] = e.target.value;
      entries[state.selectedDate] = dayData;
      setData(KEY.school, entries);
      saveDB();
    };
    list.appendChild(card);
  });
}

function renderWork() {
  const list = $("work-list");
  if(!list) return;
  list.innerHTML = "";
  if (isSchoolDay()) {
    list.innerHTML = "<div class='panel muted'>Heute ist Schule.</div>";
    return;
  }
  const entries = getData(KEY.work, {});
  const dayData = entries[state.selectedDate] || { tasks: [], note: "" };
  const templates = getData(KEY.workTemplates, { "Allgemein": [] });

  Object.keys(templates).forEach(cat => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div class="h3" style="margin:0;">${esc(cat)}</div>
        <button class="btn-icon" style="font-size:1.2rem;" onclick="addNewTaskInline('${esc(cat)}')">+</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;" id="chips-${esc(cat)}"></div>
    `;
    const container = card.querySelector(`#chips-${cat}`);
    templates[cat].forEach(task => {
      const chip = document.createElement("div");
      chip.className = "chip" + (dayData.tasks.includes(task) ? " active" : "");
      chip.textContent = task;
      chip.onclick = () => {
        if (dayData.tasks.includes(task)) dayData.tasks = dayData.tasks.filter(t => t !== task);
        else dayData.tasks.push(task);
        entries[state.selectedDate] = dayData;
        setData(KEY.work, entries);
        saveDB();
        renderWork();
      };
      container.appendChild(chip);
    });
    list.appendChild(card);
  });
  
  const noteArea = $("work-note");
  if(noteArea) {
    noteArea.value = dayData.note || "";
    noteArea.oninput = (e) => {
      dayData.note = e.target.value;
      entries[state.selectedDate] = dayData;
      setData(KEY.work, entries);
      saveDB();
    };
  }
}

// NEU: Direktes Hinzufügen im Arbeitstab
window.addNewTaskInline = (cat) => {
  const newTask = prompt("Neue Tätigkeit für " + cat + ":");
  if (newTask) {
    const t = getData(KEY.workTemplates, {});
    if (!t[cat]) t[cat] = [];
    t[cat].push(newTask);
    setData(KEY.workTemplates, t);
    renderWork();
    saveDB();
  }
};

function renderReport() {
  const d = new Date(state.selectedDate);
  const monday = new Date(d.setDate(d.getDate() - (d.getDay() || 7) + 1 + (state.weekOff * 7)));
  $("report-week-label").textContent = "Woche ab " + monday.toLocaleDateString('de-DE');
  
  let sText = ""; let wTasks = new Set();
  const sEntries = getData(KEY.school, {}); 
  const wEntries = getData(KEY.work, {});
  
  for (let i = 0; i < 5; i++) {
    const curr = new Date(monday); 
    curr.setDate(curr.getDate() + i);
    const iso = curr.toISOString().split("T")[0];
    if (sEntries[iso]) {
        Object.entries(sEntries[iso]).forEach(([s,v]) => { if(v) sText += s + ": " + v + "\n"; });
    }
    if (wEntries[iso]) {
        wEntries[iso].tasks.forEach(t => wTasks.add(t));
    }
  }
  $("report-draft-school").value = sText.trim() || "Keine Einträge";
  $("report-draft-work").value = wTasks.size > 0 ? Array.from(wTasks).join(", ") : "Keine Aufgaben";
}

function renderSetup() {
  const list = $("setup-subject-list"); list.innerHTML = "";
  getData(KEY.subjects, []).forEach(s => { 
    const c = document.createElement("div"); c.className = "chip"; c.textContent = s; list.appendChild(c); 
  });
  const grid = $("setup-schooldays"); grid.innerHTML = "";
  const names = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]; 
  const days = getData(KEY.days, [1, 2]);
  names.forEach((name, i) => {
    const b = document.createElement("button"); 
    b.className = "weekday" + (days.includes(i) ? " active" : ""); 
    b.textContent = name;
    b.onclick = () => { 
      let d = getData(KEY.days, [1, 2]); 
      d = d.includes(i) ? d.filter(x => x !== i) : [...d, i]; 
      setData(KEY.days, d); renderSetup(); 
    };
    grid.appendChild(b);
  });
}

function renderSetupTemplates() {
  const t = getData(KEY.workTemplates, {}); const sel = $("setup-category-select"); if(!sel) return;
  sel.innerHTML = ""; 
  Object.keys(t).forEach(c => { 
    const o = document.createElement("option"); o.value = c; o.textContent = c; sel.appendChild(o); 
  });
  if(sel.value) renderSetupTemplatesTaskList(sel.value);
  sel.onchange = (e) => renderSetupTemplatesTaskList(e.target.value);
}

function renderSetupTemplatesTaskList(cat) {
  const list = $("setup-task-list"); list.innerHTML = ""; const t = getData(KEY.workTemplates, {});
  (t[cat] || []).forEach(task => {
    const d = document.createElement("div"); 
    d.style = "display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid var(--line);";
    d.innerHTML = `<span>${esc(task)}</span><span style="color:var(--danger);cursor:pointer">✕</span>`;
    d.lastChild.onclick = () => { 
      t[cat] = t[cat].filter(x => x !== task); 
      setData(KEY.workTemplates, t); renderSetupTemplatesTaskList(cat); 
    };
    list.appendChild(d);
  });
}

async function saveDB() {
  if (!currentUser) return;
  const day = state.selectedDate;
  await supabaseClient.from("day_entries").upsert({
    user_id: currentUser.id, 
    day: day, 
    school: getData(KEY.school, {})[day] || {},
    work: getData(KEY.work, {})[day] || { tasks: [], note: "" }, 
    updated_at: new Date().toISOString()
  });
}

async function syncDown() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient.from("day_entries").select("*").eq("user_id", currentUser.id);
  if (data) {
    const s = getData(KEY.school, {}); 
    const w = getData(KEY.work, {});
    data.forEach(e => { s[e.day] = e.school; w[e.day] = e.work; });
    setData(KEY.school, s); 
    setData(KEY.work, w);
  }
}