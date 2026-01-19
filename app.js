// app.js – vollständige Kernlogik der Berichtsheft‑App (PWA)

/*************************
 * GLOBAL STATE
 *************************/
const state = {
  selectedDate: new Date().toISOString().split('T')[0],
};

/*************************
 * STORAGE HELPERS
 *************************/
function getData(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('Storage read error', key, e);
    return fallback;
  }
}

function setData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/*************************
 * DEFAULT DATA
 *************************/
function ensureDefaults() {
  if (!getData('subjects')) setData('subjects', []);
  if (!getData('schoolDays')) setData('schoolDays', []); // 0–6 (So–Sa)
  if (!getData('workTemplates')) setData('workTemplates', {});
  if (!getData('schoolEntries')) setData('schoolEntries', {});
  if (!getData('workEntries')) setData('workEntries', {});
  if (getData('darkMode') === null) setData('darkMode', false);
}

/*************************
 * SETUP CHECK
 *************************/
function isSetupDone() {
  return getData('setupDone', false) === true;
}

/*************************
 * APP INIT
 *************************/
document.addEventListener('DOMContentLoaded', () => {
  ensureDefaults();
  applyDarkMode();

  if (!isSetupDone()) {
    showScreen('setup');
  } else {
    showScreen('app');
    activateTab('day');
    renderDay();
  }

  initTabs();
});

/*************************
 * SCREEN HANDLING
 *************************/
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(`${name}-screen`).classList.remove('hidden');
}

/*************************
 * TAB HANDLING
 *************************/
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.target));
  });
}

function activateTab(target) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-target="${target}"]`).classList.add('active');

  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  document.getElementById(target).classList.remove('hidden');

  if (target === 'day') renderDay();
  if (target === 'school') renderSchool();
  if (target === 'work') renderWork();
  if (target === 'report') renderReport();
  if (target === 'settings') renderSettings();
}

/*************************
 * DATE HELPERS
 *************************/
function isSchoolDay(dateStr) {
  const days = getData('schoolDays', []);
  const d = new Date(dateStr);
  return days.includes(d.getDay());
}

function changeDay(offset) {
  const d = new Date(state.selectedDate);
  d.setDate(d.getDate() + offset);
  state.selectedDate = d.toISOString().split('T')[0];
  renderDay();
}

/*************************
 * TAB: DAY
 *************************/
function renderDay() {
  const date = new Date(state.selectedDate);

  document.getElementById('current-date').textContent = date.toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  document.getElementById('day-type').textContent =
    isSchoolDay(state.selectedDate) ? 'Schule' : 'Arbeit';
}

function openEntry() {
  activateTab(isSchoolDay(state.selectedDate) ? 'school' : 'work');
}

/*************************
 * TAB: SCHOOL
 *************************/
function renderSchool() {
  const container = document.getElementById('school-list');
  container.innerHTML = '';

  if (!isSchoolDay(state.selectedDate)) {
    container.innerHTML = '<p>Heute ist kein Berufsschultag.</p>';
    return;
  }

  const subjects = getData('subjects', []);
  const entries = getData('schoolEntries', {});
  const dayData = entries[state.selectedDate] || {};

  subjects.forEach(subj => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${subj}</h3>
      <textarea placeholder="Thema / Inhalt">${dayData[subj] || ''}</textarea>
    `;

    card.querySelector('textarea').addEventListener('input', e => {
      entries[state.selectedDate] = entries[state.selectedDate] || {};
      entries[state.selectedDate][subj] = e.target.value;
      setData('schoolEntries', entries);
    });

    container.appendChild(card);
  });
}

/*************************
 * TAB: WORK
 *************************/
function renderWork() {
  const container = document.getElementById('work-list');
  container.innerHTML = '';

  if (isSchoolDay(state.selectedDate)) {
    container.innerHTML = '<p>Heute ist kein Arbeitstag.</p>';
    return;
  }

  const templates = getData('workTemplates', {});
  const entries = getData('workEntries', {});
  const day = entries[state.selectedDate] || { tasks: [], note: '' };

  Object.keys(templates).forEach(cat => {
    const section = document.createElement('div');
    section.className = 'card';
    section.innerHTML = `<h3>${cat}</h3>`;

    templates[cat].forEach(task => {
      const label = document.createElement('label');
      const checked = day.tasks.includes(task);
      label.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''}> ${task}`;

      label.querySelector('input').addEventListener('change', e => {
        if (e.target.checked && !day.tasks.includes(task)) day.tasks.push(task);
        if (!e.target.checked) day.tasks = day.tasks.filter(t => t !== task);
        entries[state.selectedDate] = day;
        setData('workEntries', entries);
      });

      section.appendChild(label);
    });

    container.appendChild(section);
  });

  const note = document.createElement('textarea');
  note.placeholder = 'Notizen / Besonderheiten';
  note.value = day.note;
  note.addEventListener('input', e => {
    day.note = e.target.value;
    entries[state.selectedDate] = day;
    setData('workEntries', entries);
  });

  container.appendChild(note);
}

/*************************
 * TAB: REPORT
 *************************/
function renderReport() {
  const container = document.getElementById('report-content');
  container.innerHTML = '<p>Wochenübersicht & Statistik folgen hier.</p>';
}

/*************************
 * TAB: SETTINGS
 *************************/
function renderSettings() {
  document.getElementById('dark-toggle').checked = getData('darkMode', false);
}

function toggleDarkMode(enabled) {
  setData('darkMode', enabled);
  applyDarkMode();
}

function applyDarkMode() {
  document.body.classList.toggle('dark', getData('darkMode', false));
}

function resetSetup() {
  localStorage.clear();
  location.reload();
}

/*************************
 * SETUP FLOW
 *************************/
function finishSetup(subjects, schoolDays, workTemplates) {
  setData('subjects', subjects);
  setData('schoolDays', schoolDays);
  setData('workTemplates', workTemplates);
  setData('setupDone', true);

  showScreen('app');
  activateTab('day');
  renderDay();
}
