const SUPABASE_URL = "https://epeqhchtatxgninetvid.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZXFoY2h0YXR4Z25pbmV0dmlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTIyNTIsImV4cCI6MjA4NDQyODI1Mn0.5yNc888ypwrAcUGvSZM8CfssRMbcovBFyltkSx6fErA";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
const state = { selectedDate: new Date().toISOString().split("T")[0], weekOff: 0 };
const KEY = { setup: "setupDone", subjects: "subjects", days: "schoolDays", school: "schoolEntries", work: "workEntries", dark: "darkMode", tmpl: "workTemplates" };

const $ = (id) => document.getElementById(id);
const getD = (k, f) => JSON.parse(localStorage.getItem(k) || JSON.stringify(f));
const setD = (k, v) => localStorage.setItem(k, JSON.stringify(v));

document.addEventListener("DOMContentLoaded", async () => {
    applyDark();
    sb.auth.onAuthStateChange((ev, sess) => {
        currentUser = sess?.user || null;
        if (!currentUser) {
            document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
            document.getElementById("login-screen").classList.remove("hidden");
        } else {
            document.getElementById("login-screen").classList.add("hidden");
            if (!getD(KEY.setup, false)) {
                document.getElementById("setup-screen").classList.remove("hidden");
                renderSetup();
            } else {
                document.getElementById("app-screen").classList.remove("hidden");
                renderAll();
                switchTab(isSchool() ? "school" : "work");
            }
            syncDown();
        }
    });
    bindEvents();
});

function bindEvents() {
    $("login-btn").onclick = async () => { const {error} = await sb.auth.signInWithPassword({email: $("login-email").value, password: $("login-pass").value}); if(error) alert(error.message); };
    $("signup-btn").onclick = async () => { const {error} = await sb.auth.signUp({email: $("login-email").value, password: $("login-pass").value}); alert(error ? error.message : "Erfolg! Bitte E-Mails bestätigen."); };
    $("hidden-date-input").onchange = (e) => { if(e.target.value) { state.selectedDate = e.target.value; renderAll(); switchTab(isSchool() ? "school" : "work"); } };
    $("open-settings").onclick = () => switchTab("settings");
    document.querySelectorAll(".tabbtn").forEach(b => b.onclick = () => switchTab(b.dataset.tab));
    $("setup-add-subject").onclick = () => { const v = $("setup-subject-input").value.trim(); if(v) { let s = getD(KEY.subjects, []); s.push(v); setD(KEY.subjects, s); $("setup-subject-input").value=""; renderSetup(); } };
    $("setup-finish").onclick = () => { if(getD(KEY.subjects, []).length > 0) { setD(KEY.setup, true); location.reload(); } else alert("Bitte füge mind. ein Fach hinzu!"); };
    $("dark-toggle").onchange = (e) => { setD(KEY.dark, e.target.checked); applyDark(); };
    $("report-prev").onclick = () => { state.weekOff--; renderReport(); };
    $("report-next").onclick = () => { state.weekOff++; renderReport(); };
    $("reset-all").onclick = () => { if(confirm("Wirklich alles löschen?")) { localStorage.clear(); location.reload(); } };
}

async function syncDown() {
    if (!currentUser) return;
    const {data} = await sb.from("day_entries").select("*").eq("user_id", currentUser.id);
    if (data) {
        const s = getD(KEY.school, {}), w = getD(KEY.work, {});
        data.forEach(e => { s[e.day] = e.school; w[e.day] = e.work; });
        setD(KEY.school, s); setD(KEY.work, w); renderAll();
    }
}

async function saveDB() {
    if (!currentUser) return;
    const day = state.selectedDate;
    await sb.from("day_entries").upsert({ 
        user_id: currentUser.id, 
        day, 
        school: getD(KEY.school, {})[day] || {}, 
        work: getD(KEY.work, {})[day] || {tasks:[], note:""},
        updated_at: new Date().toISOString()
    });
}

function switchTab(t) {
    document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
    const target = document.getElementById("tab-" + t);
    if(target) target.classList.remove("hidden");
    document.querySelectorAll(".tabbtn").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
    if (t === "report") renderReport();
    if (t === "settings") renderSettings();
    $("topbar-title").textContent = new Date(state.selectedDate).toLocaleDateString("de-DE", {weekday:'short', day:'2-digit', month:'2-digit'});
}

function isSchool() { return getD(KEY.days, [1]).includes(new Date(state.selectedDate).getDay()); }

function renderSchool() {
    const l = $("school-list"); l.innerHTML = "";
    if (!isSchool()) { l.innerHTML = "<div class='panel muted' style='text-align:center;'>Heute ist kein Schultag.</div>"; return; }
    const entries = getD(KEY.school, {}), cur = entries[state.selectedDate] || {};
    getD(KEY.subjects, ["Fachtheorie"]).forEach(s => {
        const d = document.createElement("div"); d.className = "card";
        d.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;">${s}</div><textarea class="textarea" placeholder="Inhalt...">${cur[s] || ""}</textarea>`;
        d.querySelector("textarea").oninput = (e) => { cur[s] = e.target.value; entries[state.selectedDate] = cur; setD(KEY.school, entries); saveDB(); };
        l.appendChild(d);
    });
}

function renderWork() {
    const l = $("work-list"); l.innerHTML = "";
    if (isSchool()) { l.innerHTML = "<div class='panel muted' style='text-align:center;'>Heute ist Schule. Geh zum Schule-Tab.</div>"; return; }
    const entries = getD(KEY.work, {}), cur = entries[state.selectedDate] || { tasks: [], note: "" };
    const tmpl = getD(KEY.tmpl, { "Verkauf": ["Kassieren", "Kundenberatung"], "Lager": ["Ware verräumen", "Inventur"], "Sonstiges": ["Putzen", "Büro"] });
    Object.keys(tmpl).forEach(cat => {
        const d = document.createElement("div"); d.className = "card"; d.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;">${cat}</div>`;
        tmpl[cat].forEach(t => {
            const btn = document.createElement("div"); btn.className = "chip" + (cur.tasks.includes(t) ? " active" : "");
            btn.textContent = t; btn.onclick = () => {
                cur.tasks = cur.tasks.includes(t) ? cur.tasks.filter(x => x !== t) : [...cur.tasks, t];
                entries[state.selectedDate] = cur; setD(KEY.work, entries); saveDB(); renderWork();
            };
            d.appendChild(btn);
        });
        l.appendChild(d);
    });
    $("work-note").value = cur.note || "";
    $("work-note").oninput = (e) => { cur.note = e.target.value; entries[state.selectedDate] = cur; setD(KEY.work, entries); saveDB(); };
}

function renderReport() {
    const today = new Date();
    const mo = new Date(today.setDate(today.getDate() - (today.getDay()||7) + 1 + (state.weekOff * 7)));
    $("report-week").textContent = "KW " + getWeekNumber(mo) + " (ab " + mo.toLocaleDateString() + ")";
    let sT = "", wT = new Set();
    const sAll = getD(KEY.school, {}), wAll = getD(KEY.work, {});
    for(let i=0; i<5; i++) {
        const d = new Date(mo); d.setDate(d.getDate() + i);
        const iso = d.toISOString().split("T")[0];
        if(sAll[iso]) Object.entries(sAll[iso]).forEach(([f,v]) => { if(v) sT += f + ": " + v + "\n"; });
        if(wAll[iso]) wAll[iso].tasks.forEach(t => wT.add(t));
    }
    $("report-draft-school").value = sT.trim() || "Keine Schuleinträge gefunden.";
    $("report-draft-work").value = wT.size ? "Tätigkeiten: " + Array.from(wT).join(", ") : "Keine Aufgaben gewählt.";
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}

function renderSetup() {
    const l = $("setup-subject-list"); l.innerHTML = "";
    getD(KEY.subjects, []).forEach(s => { const c = document.createElement("div"); c.className="chip"; c.textContent=s; l.appendChild(c); });
    const g = $("setup-schooldays"); g.innerHTML = "";
    ["So","Mo","Di","Mi","Do","Fr","Sa"].forEach((n,i) => {
        const b = document.createElement("button"); b.className = "weekday" + (getD(KEY.days, [1]).includes(i) ? " active" : "");
        b.textContent = n; b.onclick = () => {
            let d = getD(KEY.days, [1]); d = d.includes(i) ? d.filter(x=>x!==i) : [...d,i];
            setD(KEY.days, d); renderSetup();
        };
        g.appendChild(b);
    });
}

function renderSettings() {
    const g = $("settings-schooldays"); g.innerHTML = "";
    ["So","Mo","Di","Mi","Do","Fr","Sa"].forEach((n,i) => {
        const b = document.createElement("button"); b.className = "weekday" + (getD(KEY.days, [1]).includes(i) ? " active" : "");
        b.textContent = n; b.onclick = () => {
            let d = getD(KEY.days, [1]); d = d.includes(i) ? d.filter(x=>x!==i) : [...d,i];
            setD(KEY.days, d); renderSettings();
        };
        g.appendChild(b);
    });
}

function renderAll() { renderSchool(); renderWork(); }
function applyDark() { document.body.classList.toggle("light", !getD(KEY.dark, true)); $("dark-toggle").checked = getD(KEY.dark, true); }