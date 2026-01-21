const SUPABASE_URL = "https://epeqhchtatxgninetvid.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZXFoY2h0YXR4Z25pbmV0dmlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTIyNTIsImV4cCI6MjA4NDQyODI1Mn0.5yNc888ypwrAcUGvSZM8CfssRMbcovBFyltkSx6fErA";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
const state = { selectedDate: new Date().toISOString().split("T")[0], weekOff: 0 };
const KEY = { setup: "setupDone", subjects: "subjects", days: "schoolDays", school: "schoolEntries", work: "workEntries", dark: "darkMode" };

const $ = (id) => document.getElementById(id);
const getD = (k, f) => JSON.parse(localStorage.getItem(k) || JSON.stringify(f));
const setD = (k, v) => localStorage.setItem(k, JSON.stringify(v));

document.addEventListener("DOMContentLoaded", async () => {
    applyDark();
    const { data: { session } } = await supabaseClient.auth.getSession();
    handleAuth(session?.user);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        handleAuth(session?.user);
    });
    bindEvents();
});

function handleAuth(user) {
    currentUser = user;
    if (!user) {
        $("login-screen").classList.remove("hidden");
        $("app-screen").classList.add("hidden");
        $("setup-screen").classList.add("hidden");
    } else {
        $("login-screen").classList.add("hidden");
        if (!getD(KEY.setup, false)) {
            $("setup-screen").classList.remove("hidden");
            renderSetup();
        } else {
            $("app-screen").classList.remove("hidden");
            renderAll();
            switchTab(isSchool() ? "school" : "work");
        }
    }
}

function bindEvents() {
    $("login-btn").onclick = async () => {
        const email = $("login-email").value;
        const password = $("login-pass").value;
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) alert("Login fehlgeschlagen: " + error.message);
    };
    $("signup-btn").onclick = async () => {
        const email = $("login-email").value;
        const password = $("login-pass").value;
        const { error } = await supabaseClient.auth.signUp({ email, password });
        alert(error ? error.message : "Erfolg! Bitte E-Mails prüfen.");
    };
    $("hidden-date-input").onchange = (e) => {
        state.selectedDate = e.target.value;
        renderAll();
        switchTab(isSchool() ? "school" : "work");
    };
    $("open-settings").onclick = () => switchTab("settings");
    document.querySelectorAll(".tabbtn").forEach(b => {
        b.onclick = () => switchTab(b.dataset.tab);
    });
    $("setup-add-subject").onclick = () => {
        const v = $("setup-subject-input").value;
        if(v) { let s = getD(KEY.subjects, []); s.push(v); setD(KEY.subjects, s); $("setup-subject-input").value=""; renderSetup(); }
    };
    $("setup-finish").onclick = () => { setD(KEY.setup, true); location.reload(); };
    $("dark-toggle").onchange = (e) => { setD(KEY.dark, e.target.checked); applyDark(); };
    $("reset-all").onclick = () => { if(confirm("Alles löschen?")) { localStorage.clear(); location.reload(); }};
}

function isSchool() { return getD(KEY.days, [1]).includes(new Date(state.selectedDate).getDay()); }

function switchTab(t) {
    document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
    if($( "tab-" + t)) $("tab-" + t).classList.remove("hidden");
    document.querySelectorAll(".tabbtn").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
    $("topbar-title").textContent = new Date(state.selectedDate).toLocaleDateString("de-DE", {weekday:'short', day:'2-digit', month:'2-digit'});
}

function renderSchool() {
    const l = $("school-list"); l.innerHTML = "";
    if(!isSchool()) { l.innerHTML = "<div class='panel'>Kein Schultag</div>"; return; }
    const entries = getD(KEY.school, {}), cur = entries[state.selectedDate] || {};
    getD(KEY.subjects, []).forEach(s => {
        const d = document.createElement("div"); d.className = "card";
        d.innerHTML = `<b>${s}</b><textarea class="textarea">${cur[s] || ""}</textarea>`;
        d.querySelector("textarea").oninput = (e) => { cur[s] = e.target.value; entries[state.selectedDate] = cur; setD(KEY.school, entries); };
        l.appendChild(d);
    });
}

function renderWork() {
    const l = $("work-list"); l.innerHTML = "";
    if(isSchool()) { l.innerHTML = "<div class='panel'>Heute ist Schule</div>"; return; }
    const entries = getD(KEY.work, {}), cur = entries[state.selectedDate] || { tasks: [], note: "" };
    ["Kasse", "Lager", "Verkauf"].forEach(t => {
        const btn = document.createElement("div"); btn.className = "chip" + (cur.tasks.includes(t) ? " active" : "");
        btn.textContent = t; btn.onclick = () => {
            cur.tasks = cur.tasks.includes(t) ? cur.tasks.filter(x => x !== t) : [...cur.tasks, t];
            entries[state.selectedDate] = cur; setD(KEY.work, entries); renderWork();
        };
        l.appendChild(btn);
    });
}

function renderSetup() {
    const l = $("setup-subject-list"); l.innerHTML = "";
    getD(KEY.subjects, []).forEach(s => { const c = document.createElement("div"); c.className="chip"; c.textContent=s; l.appendChild(c); });
    const g = $("setup-schooldays"); g.innerHTML = "";
    ["S","M","D","M","D","F","S"].forEach((n,i) => {
        const b = document.createElement("button"); b.className = "weekday" + (getD(KEY.days, [1]).includes(i) ? " active" : "");
        b.textContent = n; b.onclick = () => {
            let d = getD(KEY.days, [1]); d = d.includes(i) ? d.filter(x=>x!==i) : [...d,i];
            setD(KEY.days, d); renderSetup();
        };
        g.appendChild(b);
    });
}

function renderAll() { renderSchool(); renderWork(); }
function applyDark() { document.body.classList.toggle("light", !getD(KEY.dark, true)); }