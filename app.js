/* =========================================================
   app.js — VOLLSTÄNDIGE UNGEKÜRZTE ORIGINAL-LOGIK (TEIL 1)
   ========================================================= */

const SUPABASE_URL = "https://epeqhchtatxgninetvid.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZXFoY2h0YXR4Z25pbmV0dmlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NTIyNTIsImV4cCI6MjA4NDQyODI1Mn0.5yNc888ypwrAcUGvSZM8CfssRMbcovBFyltkSx6fErA";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let isSyncing = false;

const KEY = {
    setup: "setupDone",
    subjects: "subjects",
    days: "schoolDays",
    school: "schoolEntries",
    work: "workEntries",
    dark: "darkMode",
    workTemplates: "workTemplates",
    lastSync: "lastSyncTimestamp",
    version: "appVersion"
};

const state = {
    selectedDate: new Date().toISOString().split("T")[0],
    weekOff: 0,
    activeTab: "work",
    hasUnsavedChanges: false
};

// --- CORE UTILS ---
const $ = (id) => document.getElementById(id);
const show = (el) => { if(el) el.classList.remove("hidden"); };
const hide = (el) => { if(el) el.classList.add("hidden"); };
const getData = (k, fb) => {
    try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : fb;
    } catch (e) {
        console.error("Storage Error for " + k, e);
        return fb;
    }
};
const setData = (k, v) => {
    try {
        localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
        console.error("Save Error", e);
    }
};

const esc = (t) => {
    if (!t) return "";
    const d = document.createElement("div");
    d.textContent = t;
    return d.innerHTML;
};

// --- INITIALISIERUNG ---
document.addEventListener("DOMContentLoaded", async () => {
    console.log("System Initialisierung gestartet...");
    applyDark();
    
    // Auth Check
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) console.error("Auth Session Error", sessionError);
    
    handleAuthState(session?.user || null);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        console.log("Auth Status geändert:", _event);
        handleAuthState(session?.user || null);
    });

    initEventListeners();
});

function handleAuthState(user) {
    currentUser = user;
    if (!user) {
        console.log("Kein User gefunden. Zeige Login.");
        show($("login-screen"));
        hide($("app-screen"));
        hide($("setup-screen"));
    } else {
        console.log("User eingeloggt:", user.email);
        hide($("login-screen"));
        if (!getData(KEY.setup, false)) {
            show($("setup-screen"));
            renderSetup();
            renderSetupTemplates();
        } else {
            show($("app-screen"));
            startFullSync();
        }
    }
}

function applyDark() {
    const isDark = getData(KEY.dark, true);
    document.body.classList.toggle("light", !isDark);
    const toggle = $("dark-toggle");
    if (toggle) toggle.checked = isDark;
}

async function startFullSync() {
    if (isSyncing) return;
    console.log("Synchronisierung läuft...");
    await syncDown();
    renderAll();
    updateTopbar();
    switchTab(isSchoolDay() ? "school" : "work");
}
/* =========================================================
   app.js — TEIL 2: INTERAKTION & LOGIK
   ========================================================= */

function initEventListeners() {
    // --- AUTH EVENTS ---
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
            if (error) alert(error.message); else alert("Check deine Mails!");
        };
    }

    window.logout = async () => {
        if (confirm("Möchtest du dich wirklich abmelden?")) {
            await supabaseClient.auth.signOut();
            localStorage.clear();
            location.reload();
        }
    };

    // --- NAVIGATION ---
    document.querySelectorAll(".tabbtn").forEach(btn => {
        btn.onclick = () => switchTab(btn.dataset.tab);
    });

    const dateInput = $("hidden-date-input");
    if (dateInput) {
        dateInput.onchange = (e) => {
            if (e.target.value) {
                state.selectedDate = e.target.value;
                renderAll();
                updateTopbar();
                switchTab(isSchoolDay() ? "school" : "work");
            }
        };
    }

    // --- SETUP PROCESS ---
    if ($("setup-add-subject")) {
        $("setup-add-subject").onclick = () => {
            const input = $("setup-subject-input");
            const val = input.value.trim();
            if (val) {
                const list = getData(KEY.subjects, []);
                list.push(val);
                setData(KEY.subjects, list);
                input.value = "";
                renderSetup();
            }
        };
    }

    if ($("setup-to-step-2")) $("setup-to-step-2").onclick = () => { hide($("setup-step-1")); show($("setup-step-2")); };
    if ($("setup-to-step-3")) $("setup-to-step-3").onclick = () => { hide($("setup-step-2")); show($("setup-step-3")); renderSetupTemplates(); };

    if ($("setup-add-category")) {
        $("setup-add-category").onclick = () => {
            const input = $("setup-category-input");
            const cat = input.value.trim();
            if (cat) {
                const t = getData(KEY.workTemplates, {});
                if (!t[cat]) t[cat] = [];
                setData(KEY.workTemplates, t);
                input.value = "";
                renderSetupTemplates();
            }
        };
    }

    if ($("setup-add-task")) {
        $("setup-add-task").onclick = () => {
            const cat = $("setup-category-select").value;
            const taskInput = $("setup-task-input");
            const task = taskInput.value.trim();
            if (cat && task) {
                const t = getData(KEY.workTemplates, {});
                t[cat].push(task);
                setData(KEY.workTemplates, t);
                taskInput.value = "";
                renderSetupTemplatesTaskList(cat);
            }
        };
    }

    if ($("setup-finish")) {
        $("setup-finish").onclick = async () => {
            setData(KEY.setup, true);
            await saveConfigDB();
            location.reload();
        };
    }

    // --- REPORT & SETTINGS ---
    if ($("report-prev")) $("report-prev").onclick = () => { state.weekOff--; renderReport(); };
    if ($("report-next")) $("report-next").onclick = () => { state.weekOff++; renderReport(); };

    if ($("dark-toggle")) {
        $("dark-toggle").onchange = (e) => {
            setData(KEY.dark, e.target.checked);
            applyDark();
        };
    }

    if ($("reset-all")) {
        $("reset-all").onclick = () => {
            if (confirm("VORSICHT: Dies löscht alle lokalen Daten unwiderruflich!")) {
                localStorage.clear();
                location.reload();
            }
        };
    }
}

/* =========================================================
   app.js — TEIL 3: RENDERING, REPORT & CLOUD-SYNC
   ========================================================= */

function isSchoolDay() {
    const d = new Date(state.selectedDate).getDay();
    const schoolDays = getData(KEY.days, [1, 2]);
    return schoolDays.includes(d);
}

function switchTab(t) {
    state.activeTab = t;
    document.querySelectorAll(".tab-content").forEach(c => hide(c));
    const target = $("tab-" + t);
    if (target) show(target);
    
    document.querySelectorAll(".tabbtn").forEach(b => {
        b.classList.toggle("active", b.dataset.tab === t);
    });
    
    if (t === "report") renderReport();
    if (t === "settings") renderSettingsInfo();
    updateTopbar();
}

function updateTopbar() {
    const d = new Date(state.selectedDate);
    const options = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' };
    if ($("topbar-title")) {
        $("topbar-title").textContent = d.toLocaleDateString('de-DE', options);
    }
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
        list.innerHTML = `
            <div class="panel muted" style="text-align:center;">
                <div style="font-size:2rem;margin-bottom:10px;">☕</div>
                Heute ist kein Schultag laut deinem Plan.
            </div>`;
        return;
    }

    const entries = getData(KEY.school, {});
    const dayData = entries[state.selectedDate] || {};
    const subjects = getData(KEY.subjects, []);

    subjects.forEach(sub => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
            <div class="h3">${esc(sub)}</div>
            <textarea class="textarea" placeholder="Was wurde in ${esc(sub)} unterrichtet?">${esc(dayData[sub] || "")}</textarea>
        `;
        const tx = card.querySelector("textarea");
        tx.oninput = (e) => {
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
    if (!list) return;
    list.innerHTML = "";

    if (isSchoolDay()) {
        list.innerHTML = `
            <div class="panel muted" style="text-align:center;">
                <div style="font-size:2rem;margin-bottom:10px;">🏫</div>
                Heute ist Berufsschule. Schalte auf den Reiter 'Schule' um.
            </div>`;
        return;
    }

    const entries = getData(KEY.work, {});
    const dayData = entries[state.selectedDate] || { tasks: [], note: "" };
    const templates = getData(KEY.workTemplates, { "Basis": ["Verkauf", "Lager", "Kasse"] });

    Object.keys(templates).forEach(cat => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div class="h3" style="margin:0;">${esc(cat)}</div>
                <button class="btn-icon" style="font-size:1.1rem;opacity:0.6;" onclick="addNewTaskInline('${esc(cat)}')">＋</button>
            </div>
            <div id="chips-${esc(cat)}" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
        `;
        const container = card.querySelector(`#chips-${cat}`);
        
        templates[cat].forEach(task => {
            const chip = document.createElement("div");
            chip.className = "chip" + (dayData.tasks.includes(task) ? " active" : "");
            chip.textContent = task;
            chip.onclick = () => {
                if (dayData.tasks.includes(task)) {
                    dayData.tasks = dayData.tasks.filter(t => t !== task);
                } else {
                    dayData.tasks.push(task);
                }
                entries[state.selectedDate] = dayData;
                setData(KEY.work, entries);
                saveDB();
                renderWork();
            };
            container.appendChild(chip);
        });
        list.appendChild(card);
    });

    const noteField = $("work-note");
    if (noteField) {
        noteField.value = dayData.note || "";
        noteField.oninput = (e) => {
            dayData.note = e.target.value;
            entries[state.selectedDate] = dayData;
            setData(KEY.work, entries);
            saveDB();
        };
    }
}

// INLINE FUNKTIONEN
window.addNewTaskInline = (cat) => {
    const task = prompt("Neue Tätigkeit für '" + cat + "':");
    if (task && task.trim() !== "") {
        const t = getData(KEY.workTemplates, {});
        if (!t[cat]) t[cat] = [];
        t[cat].push(task.trim());
        setData(KEY.workTemplates, t);
        renderWork();
        saveConfigDB();
    }
};

function renderSettingsInfo() {
    const container = $("tab-settings");
    if (!container) return;
    
    let infoBox = $("settings-user-info");
    if (!infoBox) {
        infoBox = document.createElement("div");
        infoBox.id = "settings-user-info";
        infoBox.className = "panel";
        container.prepend(infoBox);
    }
    infoBox.innerHTML = `
        <div class="muted">Konto</div>
        <div style="font-weight:bold;margin:5px 0 15px 0;">${currentUser?.email}</div>
        <button class="btn btn-ghost" onclick="logout()">Abmelden</button>
    `;
}

function renderReport() {
    const d = new Date(state.selectedDate);
    // Montag der gewählten Woche finden
    const monday = new Date(d.setDate(d.getDate() - (d.getDay() || 7) + 1 + (state.weekOff * 7)));
    $("report-week-label").textContent = "Woche ab " + monday.toLocaleDateString('de-DE');

    let schoolSummary = "";
    let workTasks = new Set();
    const schoolEntries = getData(KEY.school, {});
    const workEntries = getData(KEY.work, {});

    for (let i = 0; i < 5; i++) {
        const current = new Date(monday);
        current.setDate(current.getDate() + i);
        const iso = current.toISOString().split("T")[0];

        if (schoolEntries[iso]) {
            Object.entries(schoolEntries[iso]).forEach(([sub, val]) => {
                if (val) schoolSummary += `${sub}: ${val}\n`;
            });
        }
        if (workEntries[iso]) {
            workEntries[iso].tasks.forEach(t => workTasks.add(t));
        }
    }

    $("report-draft-school").value = schoolSummary.trim() || "Keine Einträge vorhanden.";
    $("report-draft-work").value = workTasks.size > 0 ? Array.from(workTasks).join(", ") : "Keine Tätigkeiten gewählt.";
}

// SETUP HELPERS
function renderSetup() {
    const list = $("setup-subject-list");
    list.innerHTML = "";
    getData(KEY.subjects, []).forEach(s => {
        const c = document.createElement("div"); c.className = "chip"; c.textContent = s; list.appendChild(c);
    });

    const grid = $("setup-schooldays");
    grid.innerHTML = "";
    const names = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const days = getData(KEY.days, [1, 2]);
    names.forEach((name, i) => {
        const b = document.createElement("button");
        b.className = "weekday" + (days.includes(i) ? " active" : "");
        b.textContent = name;
        b.onclick = () => {
            let d = getData(KEY.days, [1, 2]);
            d = d.includes(i) ? d.filter(x => x !== i) : [...d, i];
            setData(KEY.days, d);
            renderSetup();
        };
        grid.appendChild(b);
    });
}

function renderSetupTemplates() {
    const t = getData(KEY.workTemplates, {});
    const sel = $("setup-category-select");
    sel.innerHTML = "";
    Object.keys(t).forEach(c => {
        const o = document.createElement("option"); o.value = c; o.textContent = c; sel.appendChild(o);
    });
    if (sel.value) renderSetupTemplatesTaskList(sel.value);
    sel.onchange = (e) => renderSetupTemplatesTaskList(e.target.value);
}

function renderSetupTemplatesTaskList(cat) {
    const list = $("setup-task-list");
    list.innerHTML = "";
    const t = getData(KEY.workTemplates, {});
    (t[cat] || []).forEach(task => {
        const div = document.createElement("div");
        div.style = "display:flex;justify-content:space-between;padding:10px;border-bottom:1px solid var(--line);";
        div.innerHTML = `<span>${esc(task)}</span><span style="color:var(--danger);cursor:pointer;">✕</span>`;
        div.lastChild.onclick = () => {
            t[cat] = t[cat].filter(x => x !== task);
            setData(KEY.workTemplates, t);
            renderSetupTemplatesTaskList(cat);
        };
        list.appendChild(div);
    });
}

// --- SYNC ENGINE ---
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

async function saveConfigDB() {
    if (!currentUser) return;
    await supabaseClient.from("user_configs").upsert({
        user_id: currentUser.id,
        subjects: getData(KEY.subjects, []),
        schooldays: getData(KEY.days, [1, 2]),
        templates: getData(KEY.workTemplates, {})
    });
}

async function syncDown() {
    if (!currentUser) return;
    isSyncing = true;
    
    // Einträge laden
    const { data: entries } = await supabaseClient.from("day_entries").select("*").eq("user_id", currentUser.id);
    if (entries) {
        const s = getData(KEY.school, {});
        const w = getData(KEY.work, {});
        entries.forEach(e => { s[e.day] = e.school; w[e.day] = e.work; });
        setData(KEY.school, s);
        setData(KEY.work, w);
    }

    // Config laden
    const { data: config } = await supabaseClient.from("user_configs").select("*").eq("user_id", currentUser.id).single();
    if (config) {
        setData(KEY.subjects, config.subjects);
        setData(KEY.days, config.schooldays);
        setData(KEY.workTemplates, config.templates);
    }
    
    isSyncing = false;
}