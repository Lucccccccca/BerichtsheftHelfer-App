/* =========================================================
   app.js — FINAL (basic, stabil, Dark/Light)
   Passt exakt zu deinem index.html + style.css
========================================================= */

/* =========================
   STATE
========================= */
const state = {
  selectedDate: todayISO(),
  reportWeekOffset: 0,
  setupStep: 1,
};

/* =========================
   STORAGE KEYS
========================= */
const KEY = {
  setupDone: "setupDone",
  darkMode: "darkMode",
  subjects: "subjects",
  schoolDays: "schoolDays", // 0-6 (So–Sa)
  workTemplates: "workTemplates", // {cat: [task]}
  schoolEntries: "schoolEntries", // {date:{subject:text}}
  workEntries: "workEntries", // {date:{tasks:[], note:""}}
};

/* =========================
   STORAGE HELPERS
========================= */
function getData(k, fb) {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fb;
  } catch { return fb; }
}
function setData(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

/* =========================
   DEFAULTS
========================= */
function ensureDefaults() {
  if (getData(KEY.subjects, null) === null) setData(KEY.subjects, []);
  if (getData(KEY.schoolDays, null) === null) setData(KEY.schoolDays, []);
  if (getData(KEY.workTemplates, null) === null) {
    setData(KEY.workTemplates, {
      Kasse: ["Kassieren", "Pfand", "Kundenservice"],
      Ware: ["Lieferung verräumen", "Abschachteln", "MHD/Rotation"],
      "Bake-Off": ["Auflegen", "Nachbacken", "Reinigen"],
    });
  }
  if (getData(KEY.schoolEntries, null) === null) setData(KEY.schoolEntries, {});
  if (getData(KEY.workEntries, null) === null) setData(KEY.workEntries, {});
  if (getData(KEY.darkMode, null) === null) setData(KEY.darkMode, true);
  if (getData(KEY.setupDone, null) === null) setData(KEY.setupDone, false);
}

/* =========================
   DOM HELPERS
========================= */
const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");
const setText = (id, t) => { const e=$(id); if(e) e.textContent=t; };
const esc = (s) => String(s).replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));

/* =========================
   DATE HELPERS
========================= */
function todayISO(){ return new Date().toISOString().split("T")[0]; }
function addDaysISO(d,o){ const x=new Date(d); x.setDate(x.getDate()+o); return x.toISOString().split("T")[0]; }
function toDELong(d){ return new Date(d).toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long",year:"numeric"}); }
function toDEShort(d){ return new Date(d).toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit"}); }
function isSchoolDay(d){
  const days=getData(KEY.schoolDays,[]);
  return days.includes(new Date(d).getDay());
}
function startOfWeekISO(d){
  const x=new Date(d); const day=x.getDay(); const diff=(day===0?-6:1-day);
  x.setDate(x.getDate()+diff); return x.toISOString().split("T")[0];
}
function weekFrom(mo){ return Array.from({length:7},(_,i)=>addDaysISO(mo,i)); }

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", ()=>{
  ensureDefaults();
  applyDark();
  bindSetup();
  bindApp();
  bindSettings();
  bindReport();

  if(!getData(KEY.setupDone,false)) showSetup();
  else { showApp(); switchTab("day"); renderAll(); }
});

/* =========================
   SCREEN SWITCH
========================= */
function showSetup(){ show($("setup-screen")); hide($("app-screen")); state.setupStep=1; renderSetupAll(); showSetupStep(1); }
function showApp(){ hide($("setup-screen")); show($("app-screen")); }

/* =========================
   TABS
========================= */
function switchTab(name){
  document.querySelectorAll(".tabbtn").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  ["day","school","work","report","settings"].forEach(t=>{
    const el=$("tab-"+t); if(!el) return; (t===name)?show(el):hide(el);
  });
  setText("topbar-title",{day:"Tag",school:"Schule",work:"Arbeit",report:"Berichtsheft",settings:"Einstellungen"}[name]||"Tag");
  if(name==="day") renderDay();
  if(name==="school") renderSchool();
  if(name==="work") renderWork();
  if(name==="report") renderReport();
  if(name==="settings") renderSettings();
}

/* =========================
   BIND APP UI
========================= */
function bindApp(){
  document.querySelectorAll(".tabbtn").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
  $("open-settings").onclick=()=>switchTab("settings");
  $("day-prev").onclick=()=>{ state.selectedDate=addDaysISO(state.selectedDate,-1); renderAll(); };
  $("day-next").onclick=()=>{ state.selectedDate=addDaysISO(state.selectedDate, 1); renderAll(); };
  $("day-edit").onclick=()=>switchTab(isSchoolDay(state.selectedDate)?"school":"work");
  $("work-note").oninput=(e)=>{
    const all=getData(KEY.workEntries,{});
    const d=all[state.selectedDate]||{tasks:[],note:""};
    d.note=e.target.value; all[state.selectedDate]=d; setData(KEY.workEntries,all);
    renderDaySummary(); renderWorkPill();
  };
}
function renderAll(){ renderDay(); renderSchoolHeader(); renderWorkHeader(); }

/* =========================
   TAB: DAY
========================= */
function renderDay(){
  setText("day-date",toDELong(state.selectedDate));
  setText("day-type",isSchoolDay(state.selectedDate)?"Heute ist Schule":"Heute ist Arbeit");
  renderDaySummary();
}
function renderDaySummary(){
  const sch=getData(KEY.schoolEntries,{});
  const wor=getData(KEY.workEntries,{});
  const subs=getData(KEY.subjects,[]);
  let lines=[],count=0;

  if(isSchoolDay(state.selectedDate)){
    const d=sch[state.selectedDate]||{};
    subs.forEach(s=>{ const v=(d[s]||"").trim(); if(v){ count++; lines.push(`• ${s}: ${v.slice(0,60)}${v.length>60?"…":""}`); }});
    if(!lines.length) lines.push("Noch keine Themen.");
  }else{
    const d=wor[state.selectedDate]||{tasks:[],note:""};
    if(d.tasks?.length){ count+=d.tasks.length; lines.push("• Tätigkeiten: "+d.tasks.slice(0,6).join(", ")+(d.tasks.length>6?"…":"")); }
    else lines.push("• Keine Tätigkeiten.");
    if((d.note||"").trim()){ count++; lines.push("• Notiz: "+d.note.slice(0,80)+(d.note.length>80?"…":"")); }
  }
  setText("day-summary-pill",String(count));
  $("day-summary").innerHTML=lines.map(l=>`<div>${esc(l)}</div>`).join("");
}

/* =========================
   TAB: SCHOOL
========================= */
function renderSchoolHeader(){ setText("school-date",toDELong(state.selectedDate)); }
function renderSchool(){
  renderSchoolHeader();
  const list=$("school-list"); list.innerHTML="";
  if(!isSchoolDay(state.selectedDate)){
    list.innerHTML=`<div class="card"><div class="muted">Heute ist kein Berufsschultag.</div></div>`;
    setText("school-pill","0"); return;
  }
  const subs=getData(KEY.subjects,[]);
  const all=getData(KEY.schoolEntries,{});
  const d=all[state.selectedDate]||{};
  let filled=0;

  subs.forEach(s=>{
    const card=document.createElement("div"); card.className="card";
    card.innerHTML=`<div class="h3">${esc(s)}</div><textarea class="textarea" placeholder="Thema / Inhalt...">${esc(d[s]||"")}</textarea>`;
    card.querySelector("textarea").oninput=(e)=>{
      const a=getData(KEY.schoolEntries,{});
      a[state.selectedDate]=a[state.selectedDate]||{};
      a[state.selectedDate][s]=e.target.value; setData(KEY.schoolEntries,a);
      renderDaySummary(); renderSchoolPill();
    };
    list.appendChild(card);
    if((d[s]||"").trim()) filled++;
  });
  setText("school-pill",String(filled));
}
function renderSchoolPill(){
  if(!isSchoolDay(state.selectedDate)){ setText("school-pill","0"); return; }
  const subs=getData(KEY.subjects,[]);
  const d=(getData(KEY.schoolEntries,{})[state.selectedDate]||{});
  const n=subs.reduce((a,s)=>a+(((d[s]||"").trim())?1:0),0);
  setText("school-pill",String(n));
}

/* =========================
   TAB: WORK
========================= */
function renderWorkHeader(){ setText("work-date",toDELong(state.selectedDate)); }
function renderWork(){
  renderWorkHeader();
  const list=$("work-list"); list.innerHTML="";
  if(isSchoolDay(state.selectedDate)){
    list.innerHTML=`<div class="card"><div class="muted">Heute ist kein Arbeitstag.</div></div>`;
    $("work-note").value=""; setText("work-pill","0"); return;
  }
  const t=getData(KEY.workTemplates,{});
  const all=getData(KEY.workEntries,{});
  const d=all[state.selectedDate]||{tasks:[],note:""};

  Object.keys(t).sort().forEach(cat=>{
    const card=document.createElement("div"); card.className="card";
    card.innerHTML=`<div class="h3">${esc(cat)}</div>`;
    (t[cat]||[]).forEach(task=>{
      const lab=document.createElement("label"); lab.className="check";
      const chk=d.tasks?.includes(task)?"checked":"";
      lab.innerHTML=`<input type="checkbox" ${chk}><span>${esc(task)}</span>`;
      lab.querySelector("input").onchange=(e)=>{
        const a=getData(KEY.workEntries,{});
        const x=a[state.selectedDate]||{tasks:[],note:""};
        if(e.target.checked){ if(!x.tasks.includes(task)) x.tasks.push(task); }
        else x.tasks=x.tasks.filter(z=>z!==task);
        a[state.selectedDate]=x; setData(KEY.workEntries,a);
        renderDaySummary(); renderWorkPill();
      };
      card.appendChild(lab);
    });
    list.appendChild(card);
  });
  $("work-note").value=d.note||""; renderWorkPill();
}
function renderWorkPill(){
  if(isSchoolDay(state.selectedDate)){ setText("work-pill","0"); return; }
  const d=(getData(KEY.workEntries,{})[state.selectedDate]||{tasks:[],note:""});
  const n=(d.tasks?.length||0)+(((d.note||"").trim())?1:0);
  setText("work-pill",String(n));
}

/* =========================
   TAB: REPORT
========================= */
function bindReport(){
  $("report-prev").onclick=()=>{ state.reportWeekOffset--; renderReport(); };
  $("report-next").onclick=()=>{ state.reportWeekOffset++; renderReport(); };
  $("copy-draft").onclick=async()=>{
    try{ await navigator.clipboard.writeText($("report-draft").value||""); $("copy-draft").textContent="Kopiert"; setTimeout(()=>$("copy-draft").textContent="Kopieren",900); }
    catch{ alert("Kopieren nicht möglich."); }
  };
}
function renderReport(){
  const base=addDaysISO(todayISO(),state.reportWeekOffset*7);
  const mo=startOfWeekISO(base);
  setText("report-week","Woche ab "+new Date(mo).toLocaleDateString("de-DE"));
  const week=weekFrom(mo);
  const list=$("report-week-list"); list.innerHTML="";
  const sch=getData(KEY.schoolEntries,{});
  const wor=getData(KEY.workEntries,{});
  const subs=getData(KEY.subjects,[]);
  let workDays=0, schoolDays=0;

  week.forEach(d=>{
    const isSch=isSchoolDay(d); if(isSch) schoolDays++; else workDays++;
    let cnt=0, sub="";
    if(isSch){
      const x=sch[d]||{}; const f=subs.filter(s=>(x[s]||"").trim()).length; cnt=f;
      sub=f?subs.filter(s=>(x[s]||"").trim()).slice(0,3).join(", "):"keine Themen";
    }else{
      const x=wor[d]||{tasks:[],note:""}; cnt=(x.tasks?.length||0)+(((x.note||"").trim())?1:0);
      sub=x.tasks?.length?x.tasks.slice(0,3).join(", "):"keine Tätigkeiten";
    }
    const row=document.createElement("div"); row.className="week-item";
    row.innerHTML=`<div class="week-left"><div class="week-date">${esc(toDEShort(d))}</div><div class="muted">${esc(isSch?"Schule":"Arbeit")} • ${esc(sub)}</div></div><div class="pill">${cnt}</div>`;
    row.onclick=()=>{ state.selectedDate=d; renderAll(); switchTab(isSchoolDay(d)?"school":"work"); };
    list.appendChild(row);
  });
  $("report-stats").textContent=`Arbeitstage: ${workDays} • Schultage: ${schoolDays}`;
  $("report-draft").value=buildDraft(week);
}
function buildDraft(week){
  const sch=getData(KEY.schoolEntries,{});
  const wor=getData(KEY.workEntries,{});
  const subs=getData(KEY.subjects,[]);
  let tasks={}, topics=[];
  week.forEach(d=>{
    if(isSchoolDay(d)){
      const x=sch[d]||{}; subs.forEach(s=>{ const v=(x[s]||"").trim(); if(v) topics.push(`${s}: ${v}`); });
    }else{
      const x=wor[d]||{tasks:[],note:""}; (x.tasks||[]).forEach(t=>tasks[t]=(tasks[t]||0)+1);
    }
  });
  const top=Object.keys(tasks).slice(0,6).join(", ");
  let out=[];
  out.push(top?`Diese Woche habe ich überwiegend folgende Tätigkeiten ausgeführt: ${top}.`:`Diese Woche sind keine Arbeitstätigkeiten dokumentiert.`);
  out.push(topics.length?`In der Berufsschule wurden u.a. folgende Themen behandelt: ${topics.slice(0,5).join(" | ")}.`:`Für die Berufsschule sind keine Themen eingetragen.`);
  return out.join("\n\n");
}

/* =========================
   SETTINGS
========================= */
function bindSettings(){
  $("dark-toggle").onchange=(e)=>{ setData(KEY.darkMode,e.target.checked); applyDark(); };
  $("settings-add-subject").onclick=()=>{
    const v=$("settings-subject-input").value.trim(); if(!v) return;
    const s=getData(KEY.subjects,[]); if(!s.includes(v)) s.push(v);
    setData(KEY.subjects,s); $("settings-subject-input").value=""; renderSettings(); renderSchool();
  };
  $("settings-add-category").onclick=()=>{
    const v=$("settings-category-input").value.trim(); if(!v) return;
    const t=getData(KEY.workTemplates,{}); if(!t[v]) t[v]=[];
    setData(KEY.workTemplates,t); $("settings-category-input").value=""; renderSettings(); renderWork();
  };
  $("settings-add-task").onclick=()=>{
    const cat=$("settings-category-select").value; const v=$("settings-task-input").value.trim();
    if(!cat||!v) return; const t=getData(KEY.workTemplates,{});
    if(!t[cat].includes(v)) t[cat].push(v);
    setData(KEY.workTemplates,t); $("settings-task-input").value=""; renderSettings(); renderWork();
  };
  $("reset-all").onclick=()=>{
    if(!confirm("Alles löschen & neu einrichten?")) return;
    localStorage.clear(); ensureDefaults(); applyDark(); showSetup();
  };
}
function renderSettings(){
  $("dark-toggle").checked=getData(KEY.darkMode,true);
  renderSettingsSubjects(); renderSettingsSchoolDays(); renderSettingsTemplates();
}
function renderSettingsSubjects(){
  const list=$("settings-subject-list"); list.innerHTML="";
  getData(KEY.subjects,[]).forEach(s=>{
    const c=document.createElement("button"); c.className="chip"; c.innerHTML=`${esc(s)} <span class="x">✕</span>`;
    c.onclick=()=>{ setData(KEY.subjects,getData(KEY.subjects,[]).filter(x=>x!==s)); renderSettings(); renderSchool(); };
    list.appendChild(c);
  });
}
const WEEKDAYS=[{id:1,l:"Mo"},{id:2,l:"Di"},{id:3,l:"Mi"},{id:4,l:"Do"},{id:5,l:"Fr"},{id:6,l:"Sa"},{id:0,l:"So"}];
function renderSettingsSchoolDays(){
  const g=$("settings-schooldays"); g.innerHTML="";
  const d=getData(KEY.schoolDays,[]);
  WEEKDAYS.forEach(w=>{
    const b=document.createElement("button"); b.className="weekday "+(d.includes(w.id)?"active":""); b.textContent=w.l;
    b.onclick=()=>{ const x=getData(KEY.schoolDays,[]); const i=x.indexOf(w.id); (i>=0)?x.splice(i,1):x.push(w.id); setData(KEY.schoolDays,x); renderSettingsSchoolDays(); renderAll(); renderSchool(); renderWork(); };
    g.appendChild(b);
  });
}
function renderSettingsTemplates(){
  const t=getData(KEY.workTemplates,{});
  const sel=$("settings-category-select"); sel.innerHTML="";
  Object.keys(t).sort().forEach(c=>{ const o=document.createElement("option"); o.value=c; o.textContent=c; sel.appendChild(o); });
  if(!sel.value && sel.options.length) sel.value=sel.options[0].value;
  renderSettingsTaskList(sel.value);
  sel.onchange=(e)=>renderSettingsTaskList(e.target.value);
}
function renderSettingsTaskList(cat){
  const list=$("settings-task-list"); list.innerHTML="";
  if(!cat) return;
  const t=getData(KEY.workTemplates,{});
  (t[cat]||[]).forEach(task=>{
    const r=document.createElement("div"); r.className="list-row";
    r.innerHTML=`<div>${esc(task)}</div><button class="btn btn-ghost" type="button">✕</button>`;
    r.querySelector("button").onclick=()=>{
      const x=getData(KEY.workTemplates,{}); x[cat]=x[cat].filter(z=>z!==task); setData(KEY.workTemplates,x);
      renderSettingsTaskList(cat); renderWork();
    };
    list.appendChild(r);
  });
}

/* =========================
   SETUP WIZARD
========================= */
function bindSetup(){
  $("setup-add-subject").onclick=()=>{
    const v=$("setup-subject-input").value.trim(); if(!v) return;
    const s=getData(KEY.subjects,[]); if(!s.includes(v)) s.push(v);
    setData(KEY.subjects,s); $("setup-subject-input").value=""; renderSetupSubjects();
  };
  $("setup-next-1").onclick=()=>showSetupStep(2);
  $("setup-back-2").onclick=()=>showSetupStep(1);
  $("setup-next-2").onclick=()=>showSetupStep(3);
  $("setup-back-3").onclick=()=>showSetupStep(2);
  $("setup-add-category").onclick=()=>{
    const v=$("setup-category-input").value.trim(); if(!v) return;
    const t=getData(KEY.workTemplates,{}); if(!t[v]) t[v]=[];
    setData(KEY.workTemplates,t); $("setup-category-input").value=""; renderSetupTemplates();
  };
  $("setup-add-task").onclick=()=>{
    const cat=$("setup-category-select").value; const v=$("setup-task-input").value.trim();
    if(!cat||!v) return; const t=getData(KEY.workTemplates,{});
    if(!t[cat].includes(v)) t[cat].push(v);
    setData(KEY.workTemplates,t); $("setup-task-input").value=""; renderSetupTemplatesTaskList(cat);
  };
  $("setup-finish").onclick=()=>{ setData(KEY.setupDone,true); showApp(); switchTab("day"); renderAll(); };
}
function renderSetupAll(){ renderSetupSubjects(); renderSetupSchoolDays(); renderSetupTemplates(); }
function showSetupStep(n){
  state.setupStep=n;
  document.querySelectorAll(".setup-step").forEach(s=>hide(s));
  show(document.querySelector(`.setup-step[data-step="${n}"]`));
  setText("setup-progress",`${n} / 3`);
}
function renderSetupSubjects(){
  const l=$("setup-subject-list"); l.innerHTML="";
  getData(KEY.subjects,[]).forEach(s=>{
    const c=document.createElement("button"); c.className="chip"; c.innerHTML=`${esc(s)} <span class="x">✕</span>`;
    c.onclick=()=>{ setData(KEY.subjects,getData(KEY.subjects,[]).filter(x=>x!==s)); renderSetupSubjects(); };
    l.appendChild(c);
  });
}
function renderSetupSchoolDays(){
  const g=$("setup-schooldays"); g.innerHTML="";
  const d=getData(KEY.schoolDays,[]);
  WEEKDAYS.forEach(w=>{
    const b=document.createElement("button"); b.className="weekday "+(d.includes(w.id)?"active":""); b.textContent=w.l;
    b.onclick=()=>{ const x=getData(KEY.schoolDays,[]); const i=x.indexOf(w.id); (i>=0)?x.splice(i,1):x.push(w.id); setData(KEY.schoolDays,x); renderSetupSchoolDays(); };
    g.appendChild(b);
  });
}
function renderSetupTemplates(){
  const t=getData(KEY.workTemplates,{});
  const sel=$("setup-category-select"); sel.innerHTML="";
  Object.keys(t).sort().forEach(c=>{ const o=document.createElement("option"); o.value=c; o.textContent=c; sel.appendChild(o); });
  if(!sel.value && sel.options.length) sel.value=sel.options[0].value;
  renderSetupTemplatesTaskList(sel.value);
  sel.onchange=(e)=>renderSetupTemplatesTaskList(e.target.value);
}
function renderSetupTemplatesTaskList(cat){
  const list=$("setup-task-list"); list.innerHTML="";
  if(!cat) return;
  const t=getData(KEY.workTemplates,{});
  (t[cat]||[]).forEach(task=>{
    const r=document.createElement("div"); r.className="list-row";
    r.innerHTML=`<div>${esc(task)}</div><button class="btn btn-ghost" type="button">✕</button>`;
    r.querySelector("button").onclick=()=>{
      const x=getData(KEY.workTemplates,{}); x[cat]=x[cat].filter(z=>z!==task); setData(KEY.workTemplates,x);
      renderSetupTemplatesTaskList(cat);
    };
    list.appendChild(r);
  });
}

/* =========================
   DARK / LIGHT
========================= */
function applyDark(){
  document.body.classList.toggle("light", !getData(KEY.darkMode,true));
}
