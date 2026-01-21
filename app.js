const SUPABASE_URL = "https://epeqhchtatxgninetvid.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZXFoY2h0YXR4Z25pbmV0dmlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTIyNTIsImV4cCI6MjA4NDQyODI1Mn0.5yNc888ypwrAcUGvSZM8CfssRMbcovBFyltkSx6fErA";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
const state = { selectedDate: new Date().toISOString().split("T")[0], weekOff: 0 };
const KEY = { setup: "setupDone", subjects: "subjects", days: "schoolDays", school: "schoolEntries", work: "workEntries", dark: "darkMode", tmpl: "workTemplates" };

const $ = (id) => document.getElementById(id);
const getData = (k, fb) => JSON.parse(localStorage.getItem(k) || JSON.stringify(fb));
const setData = (k, v) => localStorage.setItem(k, JSON.stringify(v));

document.addEventListener("DOMContentLoaded", async () => {
  applyDark();
  const { data: { session } } = await supabaseClient.auth.getSession();
  handleUser(session?.user);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    handleUser(session?.user);
  });
  bindEvents();
});

function handleUser(user) {
  currentUser = user;
  if (!user) {
    $("login-screen").classList.remove("hidden");
    $("app-screen").classList.add("hidden");
    $("setup-screen").classList.add("hidden");
  } else {
    $("login-screen").classList.add("hidden");
    if (!getData(KEY.setup, false)) {
      $("setup-screen").classList.remove("hidden");
      renderSetup();
    } else {
      $("app-screen").classList.remove("hidden");
      renderAll();
      switchTab(isSchoolDay() ? "school" : "work");
    }
    syncDown();
  }
}

function bindEvents() {
  $("login-btn").onclick = async () => {
    const email = $("login-email").value;
    const pass = $("login-pass").value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) alert(error.message);
  };
  $("signup-btn").onclick = async () => {
    const email = $("login-email").value;
    const pass = $("login-pass").value;
    const { error } = await supabaseClient.auth.signUp({ email, password: pass });
    alert(error ? error.message : "Erfolg! Bitte E-Mails prüfen.");
  };
  $("hidden-date-input").onchange = (e) => {
    if (e.target.value) {
      state.selectedDate = e.target.value;
      renderAll();
      switchTab(isSchoolDay() ? "school" : "work");
    }
  };
  $("open-settings").onclick = () => switchTab("settings");
  document.querySelectorAll(".tabbtn").forEach(b => {
    b.onclick = () => switchTab(b.dataset.tab);
  });
  $("setup-add-subject").onclick = () => {
    const v = $("setup-subject-input").value.trim();
    if(v) { 
      let s = getData(KEY.subjects, []); 
      s.push(v); 
      setData(KEY.subjects, s); 
      $("setup-subject-input").value = ""; 
      renderSetup(); 
    }
  };
  $("setup-finish").onclick = () => { setData(KEY.setup, true); location.reload(); };
  $("dark-toggle").onchange = (e) => { setData(KEY.dark, e.target.checked); applyDark(); };
  $("reset-all").onclick = () => { if(confirm("Löschen?")) { localStorage.clear(); location.reload(); } };
  $("report-prev").onclick = () => { state.weekOff--; renderReport(); };
  $("report-next").onclick = () => { state.weekOff++; renderReport(); };
}

async function syncDown() {
  if (!currentUser) return;
  const { data } = await supabaseClient.from("day_entries").select("*").eq("user_id", currentUser.id);
  if (data) {
    const s = getData(KEY.school, {}), w = getData(KEY.work, {});
    data.forEach(e => { s[e.day] = e.school; w[e.day] = e.work; });
    setData(KEY.school, s); setData(KEY.work, w); renderAll();
  }
}

async function saveDB() {
  if (!currentUser) return;
  const day = state.selectedDate;
  await supabaseClient.from("day_entries").upsert({
    user_id: currentUser.id,
    day,
    school: getData(KEY.school, {})[day] || {},
    work: getData(KEY.work, {})[day] || { tasks: [], note: "" },
    updated_at: new Date().toISOString()
  });
}

function isSchoolDay() {
  const day = new Date(state.selectedDate).getDay();
  return getData(KEY.days, [1, 2]).includes(day);
}

function switchTab(t) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
  const target = $("tab-" + t);
  if (target) target.classList.remove("hidden");
  document.querySelectorAll(".tabbtn").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  $("topbar-title").textContent = new Date(state.selectedDate).toLocaleDateString("de-DE", { weekday: 'short', day: '2-digit', month: '2-digit' });
  if (t === "report") renderReport();
}

function renderSchool() {
  const list = $("school-list"); list.innerHTML = "";
  if (!isSchoolDay()) { list.innerHTML = "<div class='panel muted'>Kein Schultag.</div>"; return; }
  const entries = getData(KEY.school, {}), cur = entries[state.selectedDate] || {};
  getData(KEY.subjects, []).forEach(s => {
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = `<b>${s}</b><textarea class="textarea" placeholder="Thema...">${cur[s] || ""}</textarea>`;
    d.querySelector("textarea").oninput = (e) => { cur[s] = e.target.value; entries[state.selectedDate] = cur; setData(KEY.school, entries); saveDB(); };
    list.appendChild(d);
  });
}

function renderWork() {
  const list = $("work-list"); list.innerHTML = "";
  if (isSchoolDay()) { list.innerHTML = "<div class='panel muted'>Heute ist Schule.</div>"; return; }
  const entries = getData(KEY.work, {}), cur = entries[state.selectedDate] || { tasks: [], note: "" };
  const tmpl = getData(KEY.tmpl, { "Aufgaben": ["Kasse", "Lager", "Verkauf"] });
  Object.keys(tmpl).forEach(cat => {
    const d = document.createElement("div"); d.className = "card"; d.innerHTML = `<b>${cat}</b><br>`;
    tmpl[cat].forEach(t => {
      const chip = document.createElement("div"); chip.className = "chip" + (cur.tasks.includes(t) ? " active" : "");
      chip.textContent = t; chip.onclick = () => {
        cur.tasks = cur.tasks.includes(t) ? cur.tasks.filter(x => x !== t) : [...cur.tasks, t];
        entries[state.selectedDate] = cur; setData(KEY.work, entries); saveDB(); renderWork();
      };
      d.appendChild(chip);
    });
    list.appendChild(d);
  });
  $("work-note").value = cur.note || "";
  $("work-note").oninput = (e) => { cur.note = e.target.value; entries[state.selectedDate] = cur; setData(KEY.work, entries); saveDB(); };
}

function renderReport() {
  const today = new Date();
  const mo = new Date(today.setDate(today.getDate() - (today.getDay()||7) + 1 + (state.weekOff * 7)));
  $("report-week-label").textContent = "Woche ab " + mo.toLocaleDateString();
  let sT = "", wT = new Set();
  const sAll = getData(KEY.school, {}), wAll = getData(KEY.work, {});
  for(let i=0; i<5; i++){
    const d = new Date(mo); d.setDate(d.getDate() + i);
    const iso = d.toISOString().split("T")[0];
    if(sAll[iso]) Object.entries(sAll[iso]).forEach(([f,v]) => { if(v) sT += f + ": " + v + "\n"; });
    if(wAll[iso]) wAll[iso].tasks.forEach(t => wT.add(t));
  }
  $("report-draft-school").value = sT || "Keine Einträge";
  $("report-draft-work").value = Array.from(wT).join(", ") || "Keine Tätigkeiten";
}

function renderSetup() {
  const list = $("setup-subject-list"); list.innerHTML = "";
  getData(KEY.subjects, []).forEach(s => { const c = document.createElement("div"); c.className="chip"; c.textContent=s; list.appendChild(c); });
  const grid = $("setup-schooldays"); grid.innerHTML = "";
  ["S","M","D","M","D","F","S"].forEach((n,i) => {
    const b = document.createElement("button"); b.className = "weekday" + (getData(KEY.days, [1,2]).includes(i) ? " active" : "");
    b.textContent = n; b.onclick = () => {
      let d = getData(KEY.days, [1,2]); d = d.includes(i) ? d.filter(x=>x!==i) : [...d,i];
      setData(KEY.days, d); renderSetup();
    };
    grid.appendChild(b);
  });
}

function renderAll() { renderSchool(); renderWork(); }
function applyDark() { document.body.classList.toggle("light", !getData(KEY.dark, true)); }