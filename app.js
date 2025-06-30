// ---- IndexedDB storage ----
const DB_NAME = "mindspace_db";
const DB_STORE = "entries";
let db = null;
function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const request = indexedDB.open(DB_NAME, 2);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = (e) => {
      let _db = e.target.result;
      if (!_db.objectStoreNames.contains(DB_STORE))
        _db.createObjectStore(DB_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => { db = request.result; resolve(db); };
  });
}
async function getEntries() {
  let _db = await openDB();
  return new Promise(res => {
    let tx = _db.transaction(DB_STORE, "readonly");
    let store = tx.objectStore(DB_STORE);
    let req = store.getAll();
    req.onsuccess = () => res(req.result || []);
  });
}
async function saveEntry(entry) {
  let _db = await openDB();
  return new Promise(res => {
    let tx = _db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(entry);
    tx.oncomplete = res;
  });
}
async function deleteEntryById(id) {
  let _db = await openDB();
  return new Promise(res => {
    let tx = _db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = res;
  });
}
async function clearAllData() {
  let _db = await openDB();
  return new Promise(res => {
    let tx = _db.transaction([DB_STORE], "readwrite");
    tx.objectStore(DB_STORE).clear();
    tx.oncomplete = res;
  });
}

// ---- App state and DOM refs ----
let entries = [];
let theme = localStorage.getItem("mindspace_theme") || "light";
let accent = localStorage.getItem("mindspace_accent") || "";
let navState = "feed";
let editingId = null;
let searchVal = "";
const themes = [
  {name: "Light", value: "light"},
  {name: "Dark", value: "dark"},
  {name: "Blue", value: "blue"},
  {name: "Green", value: "green"},
  {name: "Pink", value: "pink"},
  {name: "Black", value: "black"},
  {name: "White", value: "white"},
];

const app = document.getElementById("app");
const fab = document.getElementById("fab");
const entriesList = document.getElementById("entriesList");
const searchInput = document.getElementById("searchInput");
const promptSection = document.getElementById("promptSection");
const quoteSection = document.getElementById("quoteSection");
const calendarSection = document.getElementById("calendarSection");
const dashboardSection = document.getElementById("dashboardSection");
const feedSection = document.getElementById("feedSection");
const settingsSection = document.getElementById("settingsSection");
const snackbar = document.getElementById("snackbar");
// Modal
const entryModal = document.getElementById("entryModal");
const entryForm = document.getElementById("entryForm");
const entryModalTitle = document.getElementById("entryModalTitle");
const closeEntryModal = document.getElementById("closeEntryModal");
const entryTitle = document.getElementById("entryTitle");
const entryContent = document.getElementById("entryContent");
const tagsInput = document.getElementById("tagsInput");
const moodInput = document.getElementById("moodInput");
const locateBtn = document.getElementById("locateBtn");
const imageInput = document.getElementById("imageInput");
const audioInput = document.getElementById("audioInput");
const bookmarkBtn = document.getElementById("bookmarkBtn");
const mediaPreview = document.getElementById("mediaPreview");
const saveEntryBtn = entryForm.querySelector(".main-btn");
const deleteEntryBtn = document.getElementById("deleteEntryBtn");
// Bottom nav
const bottomNav = document.getElementById("bottomNav");
const navBtns = bottomNav.querySelectorAll(".nav-btn");
// Theme toggler
const themeToggle = document.getElementById("themeToggle");

// ---- THEME SETUP ----
function setTheme(th) {
  document.documentElement.setAttribute("data-theme", th);
  localStorage.setItem("mindspace_theme", th);
  document.getElementById("themeIcon").textContent = th === "dark" || th === "black" ? "☀️" : "🌙";
}
function setAccent(color) {
  if (color && color.length > 0) {
    document.documentElement.style.setProperty("--primary", color);
    localStorage.setItem("mindspace_accent", color);
  } else {
    document.documentElement.style.removeProperty("--primary");
    localStorage.removeItem("mindspace_accent");
  }
}
setTheme(theme);
setAccent(accent);
themeToggle.onclick = () => {
  const idx = themes.findIndex(t => t.value === theme);
  theme = themes[(idx + 1) % themes.length].value;
  setTheme(theme);
  renderSettings();
  showSnackbar(theme.charAt(0).toUpperCase() + theme.slice(1) + " theme");
};

window.addEventListener("DOMContentLoaded", loadApp);

async function loadApp() {
  entries = await getEntries();
  renderFeed();
  renderQuotes();
  renderPrompt();
}

function showSnackbar(msg, time = 2000) {
  snackbar.textContent = msg;
  snackbar.className = "show";
  setTimeout(() => { snackbar.className = snackbar.className.replace("show", ""); }, time);
}

// ---- FEED RENDER ----
function renderFeed() {
  let filtered = entries
    .filter(e => {
      if (!searchVal) return true;
      let s = searchVal.toLowerCase();
      return (e.title && e.title.toLowerCase().includes(s)) ||
        (plainText(e.content).toLowerCase().includes(s)) ||
        (e.tags && e.tags.some(t => t.toLowerCase().includes(s))) ||
        (e.mood && s.includes(e.mood)) ||
        (e.bookmarked && s === "star");
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  entriesList.innerHTML = "";
  if (!filtered.length) {
    entriesList.innerHTML = `<li style="color:var(--muted);text-align:center;opacity:.82;margin-top:2.5em">No entries yet.<br>Tap <b>+</b> to start journaling!</li>`;
    return;
  }
  for (let entry of filtered) {
    let li = document.createElement("li");
    li.className = "card entry-card fade-in";
    li.tabIndex = 0;
    li.innerHTML = `
      <div class="entry-title">${escapeHTML(entry.title || "Untitled")}</div>
      <div class="entry-date">${formatDate(entry.updatedAt)}</div>
      <div class="entry-content">${truncateHTML(entry.content, 120)}</div>
      <div class="entry-tags">
        ${(entry.tags || []).map(tag => `<span class="tag-chip" onclick="filterByTag('${tag}');event.stopPropagation();">#${escapeHTML(tag)}</span>`).join("")}
        ${entry.mood ? `<span class="entry-mood" title="${entry.mood}">${moodEmoji(entry.mood)}</span>` : ""}
      </div>
      <div class="entry-actions" style="position:absolute;top:1em;right:1.2em;">
        <button title="Bookmark" onclick="toggleBookmark('${entry.id}');event.stopPropagation();">
          <span style="font-size:1.25em;vertical-align:middle;${entry.bookmarked?'color:gold;':''}">⭐</span>
        </button>
        <button title="Edit" onclick="openEntryModal('${entry.id}');event.stopPropagation();">✏️</button>
        <button title="Delete" onclick="removeEntry('${entry.id}');event.stopPropagation();">🗑️</button>
      </div>
    `;
    li.onclick = () => openEntryModal(entry.id, true);
    entriesList.appendChild(li);
  }
}
window.filterByTag = function(tag) {
  searchVal = tag;
  searchInput.value = tag;
  renderFeed();
};
window.toggleBookmark = async function(id) {
  let entry = entries.find(e => e.id === id);
  entry.bookmarked = !entry.bookmarked;
  entry.updatedAt = new Date().toISOString();
  await saveEntry(entry);
  showSnackbar(entry.bookmarked ? "Bookmarked!" : "Bookmark removed.");
  loadApp();
};
window.removeEntry = async function(id) {
  if (!confirm("Delete this entry?")) return;
  await deleteEntryById(id);
  showSnackbar("Deleted.");
  loadApp();
};
function escapeHTML(s) { return (s || "").replace(/[&<>"']/g, m =>
  m === '&' ? '&amp;' : m === '<' ? '&lt;' : m === '>' ? '&gt;' : m === '"' ? '&quot;' : '&#39;'); }
function truncateHTML(html, n) {
  let temp = document.createElement('div'); temp.innerHTML = html;
  let text = temp.textContent || temp.innerText || "";
  return text.length > n ? text.slice(0, n) + "..." : text;
}
function plainText(html) {
  let temp = document.createElement('div'); temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
}
function formatDate(d) {
  let date = new Date(d);
  let today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today " + date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  today.setDate(today.getDate()-1);
  if (date.toDateString() === today.toDateString()) return "Yesterday " + date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  return date.toLocaleDateString(undefined, {month:'short',day:'numeric',year:'numeric'}) + " " + date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}
function moodEmoji(mood) {
  return {
    happy:"😊", sad:"😢", angry:"😡", tired:"😴", excited:"🤩", anxious:"😬", calm:"😌"
  }[mood] || "";
}

// ---- Modal Entry ----
fab.onclick = () => openEntryModal(null);
function openEntryModal(id, viewOnly = false) {
  editingId = id;
  let editingEntry = id ? entries.find(e => e.id === id) : null;
  entryModalTitle.textContent = id ? (viewOnly ? "View Entry" : "Edit Entry") : "New Entry";
  entryTitle.value = editingEntry ? editingEntry.title : "";
  entryContent.innerHTML = editingEntry ? editingEntry.content : "";
  tagsInput.value = editingEntry ? (editingEntry.tags||[]).join(", ") : "";
  moodInput.value = editingEntry ? (editingEntry.mood||"") : "";
  bookmarkBtn.classList.toggle("active", editingEntry?.bookmarked);
  mediaPreview.innerHTML = "";
  if (editingEntry && editingEntry.image) {
    mediaPreview.innerHTML += `<img src="${editingEntry.image}" alt="entry image">`;
  }
  if (editingEntry && editingEntry.audio) {
    mediaPreview.innerHTML += `<audio controls src="${editingEntry.audio}"></audio>`;
  }
  deleteEntryBtn.classList.toggle("hidden", !editingEntry);
  entryModal.classList.remove("hidden");
  setTimeout(()=>entryTitle.focus(), 110);
}
entryForm.querySelectorAll(".rte-toolbar button").forEach(btn => {
  btn.onclick = function() {
    let cmd = btn.getAttribute("data-cmd");
    if (cmd === "heading") document.execCommand("formatBlock", false, "H3");
    else document.execCommand(cmd, false, null);
    entryContent.focus();
  }
});
imageInput.onchange = function() {
  let file = this.files[0];
  if (!file) return;
  let reader = new FileReader();
  reader.onload = function(e) {
    mediaPreview.innerHTML = `<img src="${e.target.result}" alt="entry image">`;
  };
  reader.readAsDataURL(file);
};
audioInput.onchange = function() {
  let file = this.files[0];
  if (!file) return;
  let reader = new FileReader();
  reader.onload = function(e) {
    mediaPreview.innerHTML += `<audio controls src="${e.target.result}"></audio>`;
  };
  reader.readAsDataURL(file);
};
bookmarkBtn.onclick = function() {
  bookmarkBtn.classList.toggle("active");
};
locateBtn.onclick = function() {
  if (!navigator.geolocation) {
    showSnackbar("Geolocation not supported.");
    return;
  }
  locateBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(pos => {
    locateBtn.disabled = false;
    showSnackbar("Location added!");
    entryForm.dataset.location = `${pos.coords.latitude},${pos.coords.longitude}`;
  }, () => {
    locateBtn.disabled = false;
    showSnackbar("Unable to get location.");
  });
};
entryForm.onsubmit = async function(e) {
  e.preventDefault();
  let now = new Date().toISOString();
  let entry = editingId ? entries.find(e => e.id === editingId) : { id: "e"+Date.now()+Math.random().toString(36).slice(2,2), createdAt: now };
  entry.title = entryTitle.value.trim();
  entry.content = entryContent.innerHTML.trim();
  entry.updatedAt = now;
  entry.tags = tagsInput.value.replace(/[\s,]+/g, ",").split(",").map(t => t.replace(/^#/, "").trim()).filter(t => t);
  entry.mood = moodInput.value;
  entry.bookmarked = bookmarkBtn.classList.contains("active");
  entry.location = entryForm.dataset.location || "";
  if (imageInput.files[0]) {
    let reader = new FileReader();
    reader.onload = async function(e) {
      entry.image = e.target.result;
      if (audioInput.files[0]) await handleAudio(entry);
      else { await saveEntry(entry); finishEntrySave(); }
    };
    reader.readAsDataURL(imageInput.files[0]);
    return;
  }
  if (audioInput.files[0]) {
    await handleAudio(entry);
    await saveEntry(entry);
    finishEntrySave();
    return;
  }
  await saveEntry(entry);
  finishEntrySave();
};
function finishEntrySave() {
  entryModal.classList.add("hidden");
  showSnackbar("Entry saved!");
  imageInput.value = ""; audioInput.value = "";
  entryForm.dataset.location = "";
  loadApp();
}
async function handleAudio(entry) {
  return new Promise(res => {
    let reader = new FileReader();
    reader.onload = function(e) {
      entry.audio = e.target.result;
      res();
    };
    reader.readAsDataURL(audioInput.files[0]);
  });
}
closeEntryModal.onclick = () => entryModal.classList.add("hidden");
deleteEntryBtn.onclick = async function() {
  if (!editingId) return;
  await deleteEntryById(editingId);
  entryModal.classList.add("hidden");
  showSnackbar("Deleted!");
  loadApp();
};
window.addEventListener("keydown", e => {
  if (!entryModal.classList.contains("hidden") && e.key === "Escape")
    entryModal.classList.add("hidden");
});

// ---- Search & Navigation ----
searchInput.oninput = e => {
  searchVal = e.target.value.trim();
  renderFeed();
};
navBtns.forEach(btn => {
  btn.onclick = function() {
    navBtns.forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    navState = btn.dataset.nav;
    feedSection.style.display = navState === "feed" ? "block" : "none";
    calendarSection.classList.toggle("hidden", navState !== "calendar");
    dashboardSection.classList.toggle("hidden", navState !== "dashboard");
    settingsSection.classList.toggle("hidden", navState !== "settings");
    if (navState === "calendar") renderCalendar();
    if (navState === "dashboard") renderDashboard();
    if (navState === "settings") renderSettings();
  };
});

// ---- Calendar ----
function renderCalendar() {
  let byDate = {};
  for (let e of entries) {
    let day = (new Date(e.createdAt)).toISOString().slice(0,10);
    byDate[day] = byDate[day]||[]; byDate[day].push(e);
  }
  let html = `<div class="calendar-view"><h3>Journal Calendar</h3><div class="calendar-grid"><div class="calendar-row">`;
  let d = new Date(), year = d.getFullYear(), month = d.getMonth();
  let firstDay = new Date(year, month, 1).getDay();
  let days = new Date(year, month+1, 0).getDate();
  for (let i = 0; i < firstDay; i++) html += `<span></span>`;
  for (let day = 1; day <= days; day++) {
    let dt = new Date(year, month, day);
    let key = dt.toISOString().slice(0,10);
    let marked = !!byDate[key];
    html += `<span class="calendar-cell${marked ? ' marked' : ''}" data-date="${key}">${day}</span>`;
  }
  html += "</div></div></div>";
  calendarSection.innerHTML = html;
  calendarSection.classList.remove("hidden");
  calendarSection.querySelectorAll(".calendar-cell.marked").forEach(cell=>{
    cell.onclick = function() {
      let date = cell.dataset.date;
      let list = byDate[date];
      alert(`Entries on ${date}:\n\n` + list.map(e=>e.title||"(Untitled)").join("\n"));
    };
  });
}

// ---- Dashboard ----
function renderDashboard() {
  let total = entries.length;
  let words = entries.reduce((sum, e) => sum + plainText(e.content).split(/\s+/).filter(Boolean).length, 0);
  let moodsCount = {};
  entries.forEach(e => { if (e.mood) moodsCount[e.mood] = (moodsCount[e.mood]||0)+1; });
  let html = `<h3>Statistics</h3>
  <div class="stat-grid">
    <div><b>Total entries:</b> ${total}</div>
    <div><b>Total words:</b> ${words}</div>
    <div><b>Starred entries:</b> ${entries.filter(e=>e.bookmarked).length}</div>
    <div><b>Unique tags:</b> ${(new Set(entries.flatMap(e=>e.tags||[]))).size}</div>
  </div>
  <div class="stat-mood"><b>Mood log:</b> `;
  for (let m in moodsCount) {
    html += `${moodEmoji(m)||m} (${moodsCount[m]}) `;
  }
  html += "</div>";
  dashboardSection.innerHTML = html;
  dashboardSection.classList.remove("hidden");
}

// ---- Settings Page ----
function renderSettings() {
  let html = `<h3>Settings</h3>
    <div class="settings-opt">
      <b>Theme:</b>
      <select id="themePicker">${themes.map(t=>`<option value="${t.value}"${theme===t.value?' selected':''}>${t.name}</option>`).join("")}</select>
    </div>
    <div class="settings-opt">
      <b>Accent color:</b>
      <input type="color" id="accentPicker" value="${accent||'#6157F6'}">
      <button id="resetAccentBtn" class="ghost-btn">Reset</button>
    </div>
    <div class="settings-opt">
      <b>Notifications:</b>
      <button id="notifyBtn" class="main-btn">Enable Reminders</button>
    </div>
    <div class="settings-opt">
      <b>Reset Data:</b>
      <button id="resetDataBtn" class="ghost-btn">Delete all data</button>
    </div>
  `;
  settingsSection.innerHTML = html;
  settingsSection.classList.remove("hidden");
  // Theme
  document.getElementById("themePicker").onchange = e => {
    theme = e.target.value;
    setTheme(theme);
    showSnackbar("Theme changed!");
    renderSettings();
  };
  document.getElementById("accentPicker").oninput = e => {
    accent = e.target.value;
    setAccent(accent);
    showSnackbar("Accent changed!");
  };
  document.getElementById("resetAccentBtn").onclick = e => {
    accent = "";
    setAccent("");
    showSnackbar("Accent reset!");
    renderSettings();
  };
  document.getElementById("notifyBtn").onclick = requestNotification;
  document.getElementById("resetDataBtn").onclick = async function() {
    if (!confirm("Delete all data? This cannot be undone.")) return;
    await clearAllData();
    showSnackbar("All data deleted.");
    loadApp();
  };
}

// ---- Quotes and Prompts ----
const QUOTES = [
  "Your story is worth recording. —LatifGPT",
  "Sometimes the smallest entry holds the biggest meaning. —LatifGPT",
  "Your words today will inspire you tomorrow. —LatifGPT",
  "There is no right way to journal, just your way. —LatifGPT",
  "Write, even if it's just a single sentence. —LatifGPT",
  "A journal is the safest place to be yourself. —LatifGPT",
  "Your thoughts matter. Capture them. —LatifGPT",
  "One honest page can change your whole week. —LatifGPT"
];
function renderQuotes() {
  let q = QUOTES[Math.floor(Math.random()*QUOTES.length)];
  quoteSection.innerHTML = `<i>❝</i> ${q}`;
}
const PROMPTS = [
  "What made you smile today?",
  "Describe a moment you’re grateful for.",
  "What’s a goal you want to focus on this week?",
  "Write about a challenge you overcame recently.",
  "How do you feel right now?",
  "What do you want to remember about today?",
  "What are you proud of?",
  "Who is someone that inspired you recently?",
  "List three things you want to accomplish this month.",
  "What’s one small act of kindness you can do this week?",
  "Describe your ideal day.",
  "What’s a song that describes your mood today?",
  "How did you overcome a setback recently?",
  "What’s a memory you cherish?",
  "What advice would you give your future self?",
  "Describe your dream for the future.",
  "What is something new you learned today?",
  "What makes you unique?",
  "If you could travel anywhere, where would you go and why?",
  "What motivates you when things get tough?",
  "What’s a habit you want to build or break?",
  "Describe the best part of your day so far.",
  "How do you handle stress?",
  "Write about something that surprised you recently.",
  "What is a simple pleasure you enjoy?",
  "What would you tell your younger self?",
  "What do you love most about your friends or family?",
  "Write about a goal you achieved and how you did it.",
  "What’s something you want to try but haven’t yet?",
  "Describe a place where you feel at peace.",
  "What are you looking forward to tomorrow?"
];
function renderPrompt() {
  let p = PROMPTS[Math.floor(Math.random()*PROMPTS.length)];
  promptSection.innerHTML = `<i>💡</i> <b>Prompt:</b> ${p}`;
  promptSection.classList.remove("hidden");
}
document.getElementById("promptBtn").onclick = () => renderPrompt();

// ---- Notifications ----
function requestNotification() {
  if (!("Notification" in window)) { showSnackbar("Not supported."); return; }
  Notification.requestPermission().then(perm=>{
    if (perm !== "granted") { showSnackbar("Notifications denied."); return; }
    let when = prompt("Remind me daily at (HH:MM, 24h, e.g. 20:00):", "20:00") || "20:00";
    scheduleNotification(when);
    showSnackbar("Reminder set at " + when);
  });
}
function scheduleNotification(time) {
  let [h, m] = time.split(":").map(Number);
  let now = new Date(), n = new Date();
  n.setHours(h, m, 0, 0);
  if (n <= now) n.setDate(n.getDate() + 1);
  let timeout = n - now;
  setTimeout(() => {
    new Notification("Mindspace", { body: "Write in your journal today!" });
    scheduleNotification(time);
  }, timeout);
}

// ---- Service Worker registration ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}
