/***********************
 * GLOBAL STATE
 ***********************/
const state = {
  selectedDate: new Date().toISOString().split("T")[0],
};

/***********************
 * STORAGE HELPERS
 ***********************/
function getData(key, fallback) {
  return JSON.parse(localStorage.getItem(key)) ?? fallback;
}

function setData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/***********************
 * SETUP CHECK
 ***********************/
function isSetupDone() {
  return getData("setupDone", false);
}

/***********************
 * INIT APP
 ***********************/
document.addEventListener("DOMContentLoaded", () => {
  if (!isSetupDone()) {
    showScreen("setup");
  } else {
    showScreen("app");
    renderDay();
  }
  initTabs();
});

/***********************
 * SCREEN HANDLING
 ***********************/
function showScreen(screen) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  document.getElementById(`${screen}-screen`).classList.remove("hidden");
}

/***********************
 * TABS
 ***********************/
function initTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const target = tab.dataset.target;
      document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
      document.getElementById(target).classList.remove("hidden");

      if (target === "day") renderDay();
      if (target === "school") renderSchool();
      if (target === "work") renderWork();
      if (target === "report") renderReport();
      if (target === "settings") renderSettings();
    });
  });
}

/***********************
 * DATE HELPERS
 ***********************/
function isSchoolDay(date) {
  const schoolDays = getData("schoolDays", []);
  const weekday = new Date(date).getDay(); // 0 = Sunday
  return schoolDays.includes(weekday);
}

/***********************
 * TAB: DAY
 ***********************/
function renderDay() {
  const dateEl = document.getElementById("current-date");
  dateEl.textContent = new Date(state.selectedDate).toLocaleDateString("de-DE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const typeEl = document.getElementById("day-type");
  typeEl.textContent = isSchoolDay(state.selectedDate)
    ? "Heute ist Schule"
    : "Heute ist Arbeit";
}

function changeDay(offset) {
  const d = new Date(state.selectedDate);
  d.setDate(d.getDate() + offset);
  state.selectedDate = d.toISOString().split("T")[0];
  renderDay();
}

/***********************
 * TAB: SCHOOL
 ***********************/
function renderSchool() {
  const container = document.getElementById("school-list");
  container.innerHTML = "";

  if (!isSchoolDay(state.selectedDate)) {
    container.innerHTML = "<p>Heute ist kein Berufsschultag.</p>";
    return;
  }

  const subjects = getData("subjects", []);
  const entries = getData("schoolEntries", {});
  const dayEntries = entries[state.selectedDate] ?? {};

  subjects.forEach(subject => {
    const value = dayEntries[subject] ?? "";
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h3>${subject}</h3>
      <textarea placeholder="Thema / Inhalt...">${value}</textarea>
    `;
    card.querySelector("textarea").addEventListener("input", e => {
      entries[state.selectedDate] = entries[state.selectedDate] ?? {};
      entries[state.selectedDate][subject] = e.target.value;
      setData("schoolEntries", entries);
    });
    container.appendChild(card);
  });
}

/***********************
 * TAB: WORK
 ***********************/
function renderWork() {
  const container = document.getElementById("work-list");
  container.innerHTML = "";

  if (isSchoolDay(state.selectedDate)) {
    container.innerHTML = "<p>Heute ist kein Arbeitstag.</p>";
    return;
  }

  const templates = getData("workTemplates", {});
  const entries = getData("workEntries", {});
  const day = entries[state.selectedDate] ?? { tasks: [], note: "" };

  Object.keys(templates).forEach(category => {
    const section = document.createElement("div");
    section.className = "card";
    section.innerHTML = `<h3>${category}</h3>`;

    templates[category].forEach(task => {
      const checked = day.tasks.includes(task);
      const label = document.createElement("label");
      label.innerHTML = `
        <input type="checkbox" ${checked ? "checked" : ""}> ${task}
      `;
      label.querySelector("input").addEventListener("change", e => {
        if (e.target.checked) {
          day.tasks.push(task);
        } else {
          day.tasks = day.tasks.filter(t => t !== task);
        }
        entries[state.selectedDate] = day;
        setData("workEntries", entries);
      });
      section.appendChild(label);
    });

    container.appendChild(section);
  });

  const note = document.createElement("textarea");
  note.placeholder = "Notizen / Besonderheiten...";
  note.value = day.note;
  note.addEventListener("input", e => {
    day.note = e.target.value;
    entries[state.selectedDate] = day;
    setData("workEntries", entries);
  });
  container.appendChild(note);
}

/***********************
 * TAB: REPORT
 ***********************/
function renderReport() {
  const container = document.getElementById("report-content");
  container.innerHTML = "<p>Wochenübersicht & Statistiken kommen hier.</p>";
}

/***********************
 * TAB: SETTINGS
 ***********************/
function renderSettings() {
  document.getElementById("dark-toggle").checked = getData("darkMode", false);
}

function toggleDarkMode(enabled) {
  document.body.classList.toggle("dark", enabled);
  setData("darkMode", enabled);
}

/***********************
 * SETUP FLOW
 ***********************/
function finishSetup(subjects, schoolDays, workTemplates) {
  setData("subjects", subjects);
  setData("schoolDays", schoolDays);
  setData("workTemplates", workTemplates);
  setData("setupDone", true);
  showScreen("app");
  renderDay();
}
