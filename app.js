// =========================
// LOGIK & RENDERING
// =========================

function isSchoolDay() {
  const d = new Date(state.selectedDate).getDay();
  return getData(KEY.days, [1, 2]).includes(d);
}

function switchTab(t) {
  document.querySelectorAll(".tab-content").forEach(c => hide(c));
  show($("tab-" + t));
  document.querySelectorAll(".tabbtn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === t);
  });
  
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

// SCHULE RENDERN
function renderSchool() {
  const list = $("school-list");
  list.innerHTML = "";
  if (!isSchoolDay()) {
    list.innerHTML = "<div class='panel muted'>Kein Schultag laut Einstellungen.</div>";
    return;
  }
  const entries = getData(KEY.school, {});
  const dayData = entries[state.selectedDate] || {};
  const subjects = getData(KEY.subjects, ["Keine Fächer definiert"]);

  subjects.forEach(sub => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="h3">${esc(sub)}</div>
      <textarea class="textarea" placeholder="Was hast du gelernt?">${esc(dayData[sub] || "")}</textarea>`;
    
    card.querySelector("textarea").oninput = (e) => {
      dayData[sub] = e.target.value;
      entries[state.selectedDate] = dayData;
      setData(KEY.school, entries);
      saveDB();
    };
    list.appendChild(card);
  });
}

// ARBEIT RENDERN
function renderWork() {
  const list = $("work-list");
  list.innerHTML = "";
  if (isSchoolDay()) {
    list.innerHTML = "<div class='panel muted'>Heute ist Schule.</div>";
    return;
  }
  const entries = getData(KEY.work, {});
  const dayData = entries[state.selectedDate] || { tasks: [], note: "" };
  const templates = getData(KEY.workTemplates, { "Basis": ["Kasse", "Lager", "Verkauf"] });

  Object.keys(templates).forEach(cat => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="h3">${esc(cat)}</div><div class="chip-container"></div>`;
    const container = card.querySelector(".chip-container");
    
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
  $("work-note").value = dayData.note || "";
  $("work-note").oninput = (e) => {
    dayData.note = e.target.value;
    entries[state.selectedDate] = dayData;
    setData(KEY.work, entries);
    saveDB();
  };
}

// REPORT RENDERN
function renderReport() {
  const d = new Date();
  const monday = new Date(d.setDate(d.getDate() - (d.getDay() || 7) + 1 + (state.weekOff * 7)));
  $("report-week-label").textContent = "KW " + getWeekNumber(monday) + " (" + monday.toLocaleDateString() + ")";

  let schoolText = "";
  let workTasks = new Set();
  const schoolEntries = getData(KEY.school, {});
  const workEntries = getData(KEY.work, {});

  for (let i = 0; i < 5; i++) {
    const current = new Date(monday);
    current.setDate(current.getDate() + i);
    const iso = current.toISOString().split("T")[0];

    if (schoolEntries[iso]) {
      Object.entries(schoolEntries[iso]).forEach(([sub, val]) => {
        if (val) schoolText += `${sub}: ${val}\n`;
      });
    }
    if (workEntries[iso]) {
      workEntries[iso].tasks.forEach(t => workTasks.add(t));
    }
  }

  $("report-draft-school").value = schoolText.trim() || "Keine Schuleinträge diese Woche.";
  $("report-draft-work").value = workTasks.size > 0 ? "Tätigkeiten: " + Array.from(workTasks).join(", ") : "Keine Arbeitsaufgaben gewählt.";
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// SETUP HELPER
function renderSetup() {
  const list = $("setup-subject-list");
  list.innerHTML = "";
  getData(KEY.subjects, []).forEach(s => {
    const c = document.createElement("div");
    c.className = "chip";
    c.textContent = s;
    list.appendChild(c);
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
  if (!sel) return;
  sel.innerHTML = "";
  Object.keys(t).forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });
  renderSetupTemplatesTaskList(sel.value);
  sel.onchange = (e) => renderSetupTemplatesTaskList(e.target.value);
}

function renderSetupTemplatesTaskList(cat) {
  const list = $("setup-task-list");
  if (!list || !cat) return;
  list.innerHTML = "";
  const t = getData(KEY.workTemplates, {});
  (t[cat] || []).forEach(task => {
    const r = document.createElement("div");
    r.style = "display:flex; justify-content:space-between; padding:5px;";
    r.innerHTML = `<span>${esc(task)}</span><span style="cursor:pointer">✕</span>`;
    r.lastChild.onclick = () => {
      t[cat] = t[cat].filter(x => x !== task);
      setData(KEY.workTemplates, t);
      renderSetupTemplatesTaskList(cat);
    };
    list.appendChild(r);
  });
}

// =========================
// CLOUD SYNC (SUPABASE)
// =========================
async function saveDB() {
  if (!currentUser) return;
  const day = state.selectedDate;
  await supabase.from("day_entries").upsert({
    user_id: currentUser.id,
    day: day,
    school: getData(KEY.school, {})[day] || {},
    work: getData(KEY.work, {})[day] || { tasks: [], note: "" },
    updated_at: new Date().toISOString()
  });
}

async function syncDown() {
  if (!currentUser) return;
  const { data, error } = await supabase.from("day_entries").select("*").eq("user_id", currentUser.id);
  if (data) {
    const s = getData(KEY.school, {});
    const w = getData(KEY.work, {});
    data.forEach(e => {
      s[e.day] = e.school;
      w[e.day] = e.work;
    });
    setData(KEY.school, s);
    setData(KEY.work, w);
    renderAll();
  }
}