// ======= НАСТРОЙКИ =======
const API_BASE = "https://tunduk-messenger.onrender.com";
const WS_BASE  = "wss://tunduk-messenger.onrender.com";
// ==========================

let token        = localStorage.getItem("tunduk_token")    || null;
let myUsername   = localStorage.getItem("tunduk_username") || null;
let myUserId     = null;
let myBio        = "";
let myAvatar     = "";
let ws           = null;
let currentChatWith   = null;
let currentChatType   = "user";
let currentChatId     = null;
let currentChatIsAdmin = false;
let currentChatIsOwner = false;
let messageCache      = {};
let userProfileCache  = {};

let soundEnabled     = localStorage.getItem("tunduk_sound") !== "off";
let currentWallpaper = localStorage.getItem("tunduk_wallpaper") || "none";

let channelAvatarData = "";
let groupAvatarData   = "";

const WALLPAPERS = [
  { id: "none",   css: "#121317" },
  { id: "dusk",   css: "linear-gradient(160deg, #1c2030 0%, #15171c 100%)" },
  { id: "ember",  css: "linear-gradient(160deg, #2a1f14 0%, #15171c 100%)" },
  { id: "forest", css: "linear-gradient(160deg, #182218 0%, #15171c 100%)" },
  { id: "dots",   css: "radial-gradient(circle, #2c2f37 1px, #121317 1px)", size: "16px 16px" },
  { id: "grid",   css: "linear-gradient(#1d2027 1px, transparent 1px), linear-gradient(90deg, #1d2027 1px, transparent 1px)", size: "20px 20px", base: "#121317" },
];

const $ = id => document.getElementById(id);

const ICONS = {
  back:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><polyline points="15 18 9 12 15 6"/></svg>`,
  send:    `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>`,
  logout:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  tickOne: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>`,
  tickTwo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="18 6 7 17 2 12"/><polyline points="22 6 11 17 9 15"/></svg>`,
  camera:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  settings:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  search:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  members: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  shield:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
};

function injectIcons() {
  $("backBtn").innerHTML              = ICONS.back;
  $("sendBtn").innerHTML              = ICONS.send;
  $("logoutBtn").innerHTML            = ICONS.logout;
  $("profileBackBtn").innerHTML       = ICONS.back;
  $("avatarEditBtn").innerHTML        = ICONS.camera;
  $("settingsBtn").innerHTML          = ICONS.settings;
  $("settingsBackBtn").innerHTML      = ICONS.back;
  $("searchBtn").innerHTML            = ICONS.search;
  $("searchBackBtn").innerHTML        = ICONS.back;
  $("createChannelBackBtn").innerHTML = ICONS.back;
  $("createGroupBackBtn").innerHTML   = ICONS.back;
  if ($("membersBtn")) $("membersBtn").innerHTML = ICONS.members;
  if ($("membersBackBtn")) $("membersBackBtn").innerHTML = ICONS.back;
}

function setStatus(text, online) {
  const el = $("status");
  el.textContent = text;
  el.className = online ? "online" : "offline";
}

function showAuth() {
  $("auth").style.display = "flex";
  $("app").style.display  = "none";
}

function showApp() {
  $("auth").style.display = "none";
  $("app").style.display  = "flex";
  $("meLabel").textContent = myUsername;
  migrateRecentChats();
  loadMyId();
  syncContactsFromServer();  // подтягиваем чаты, где я получатель, но сам не искал
  renderRecentChats();
  connectWebSocket();
}

// ---- СИНХРОНИЗАЦИЯ КОНТАКТОВ С СЕРВЕРОМ ----
// Если кто-то мне написал, а я его не искал — чат всё равно должен появиться у меня в списке.
async function syncContactsFromServer() {
  try {
    const res = await fetch(`${API_BASE}/contacts`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const contacts = await res.json(); // список username
    let changed = false;
    const existing = getRecentChats();
    const existingSet = new Set(existing);
    const additions = [];
    for (const username of contacts) {
      const key = `user:${username}`;
      if (!existingSet.has(key)) { additions.push(key); changed = true; }
    }
    if (changed) {
      // Добавляем в конец (старые контакты, не поднимаем наверх без причины)
      const merged = [...existing, ...additions];
      localStorage.setItem(recentChatsKey(), JSON.stringify(merged));
      renderRecentChats();
    }
  } catch {}
}

// ---- МИГРАЦИЯ СТАРЫХ КЛЮЧЕЙ ----
function migrateRecentChats() {
  const key = recentChatsKey();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const list = JSON.parse(raw);
    const migrated = [];
    const seen = new Set();
    for (const item of list) {
      const normalized = item.includes(":") ? item : `user:${item}`;
      if (!seen.has(normalized)) { seen.add(normalized); migrated.push(normalized); }
    }
    localStorage.setItem(key, JSON.stringify(migrated));
  } catch {}
}

// ---- АВАТАРЫ ----
function renderAvatarInto(el, name, avatarDataUrl) {
  if (avatarDataUrl) {
    el.innerHTML = `<img src="${avatarDataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    el.style.background = "";
  } else {
    const letter = (name || "?").trim().charAt(0).toUpperCase();
    el.innerHTML = letter;
    el.style.background = colorFromString(name || "?");
  }
}

function colorFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 60%, 45%)`;
}

function updateMyAvatarUI() {
  renderAvatarInto($("myAvatarSmall"), myUsername, myAvatar);
}

// ---- AUTH ----
async function register() {
  const username = $("username").value.trim();
  const password = $("password").value;
  $("authError").textContent = "";
  if (!username || !password) { $("authError").textContent = "Заполни имя и пароль"; return; }
  try {
    const res  = await fetch(`${API_BASE}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) { $("authError").textContent = data.detail || "Ошибка регистрации"; return; }
    await login();
  } catch (e) { $("authError").textContent = "Сервер не отвечает: " + e.message; }
}

async function login() {
  const username = $("username").value.trim();
  const password = $("password").value;
  $("authError").textContent = "";
  if (!username || !password) { $("authError").textContent = "Заполни имя и пароль"; return; }
  try {
    const body = new URLSearchParams();
    body.append("username", username);
    body.append("password", password);
    body.append("grant_type", "password");
    const res  = await fetch(`${API_BASE}/login`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
    const data = await res.json();
    if (!res.ok) { $("authError").textContent = data.detail || "Ошибка входа"; return; }
    token = data.access_token; myUsername = username;
    localStorage.setItem("tunduk_token", token);
    localStorage.setItem("tunduk_username", myUsername);
    showApp();
  } catch (e) { $("authError").textContent = "Сервер не отвечает: " + e.message; }
}

function logout() {
  if (ws) { ws.close(); ws = null; }
  token = null; myUsername = null; myBio = ""; myAvatar = "";
  localStorage.removeItem("tunduk_token");
  localStorage.removeItem("tunduk_username");
  messageCache = {}; userProfileCache = {};
  $("username").value = ""; $("password").value = "";
  setStatus("не подключено", false);
  showAuth();
}

// ---- MY PROFILE ----
async function loadMyId() {
  try {
    const res = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { logout(); return; }
    const me = await res.json();
    myUserId = me.id; myBio = me.bio || ""; myAvatar = me.avatar || "";
    updateMyAvatarUI();
  } catch (e) { console.error(e); }
}

function openMyProfile() {
  $("profileUsernameInput").value = myUsername;
  $("profileBioInput").value      = myBio;
  renderAvatarInto($("profileAvatarBig"), myUsername, myAvatar);
  $("profileMsg").textContent = "";
  $("profileScreen").classList.add("active");
}

function closeProfile() { $("profileScreen").classList.remove("active"); }

async function saveProfile() {
  const newUsername = $("profileUsernameInput").value.trim();
  const newBio      = $("profileBioInput").value.trim();
  $("profileMsg").style.color = "#4caf50"; $("profileMsg").textContent = "Сохранение...";
  try {
    const res  = await fetch(`${API_BASE}/me`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ username: newUsername, bio: newBio }) });
    const data = await res.json();
    if (!res.ok) { $("profileMsg").style.color = "#f44336"; $("profileMsg").textContent = data.detail || "Ошибка"; return; }
    myUsername = data.username; myBio = data.bio || ""; myAvatar = data.avatar || "";
    localStorage.setItem("tunduk_username", myUsername);
    $("meLabel").textContent = myUsername;
    updateMyAvatarUI();
    $("profileMsg").style.color = "#4caf50"; $("profileMsg").textContent = "Сохранено";
  } catch { $("profileMsg").style.color = "#f44336"; $("profileMsg").textContent = "Сервер не отвечает"; }
}

function pickAvatarFile() { $("avatarFileInput").click(); }

function onAvatarFileChosen(e) {
  const file = e.target.files[0]; if (!file) return;
  resizeAndProcess(file, dataUrl => uploadAvatar(dataUrl));
}

async function uploadAvatar(dataUrl) {
  $("profileMsg").style.color = "#4caf50"; $("profileMsg").textContent = "Загрузка...";
  try {
    const res  = await fetch(`${API_BASE}/me`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ avatar: dataUrl }) });
    const data = await res.json();
    if (!res.ok) { $("profileMsg").style.color = "#f44336"; $("profileMsg").textContent = data.detail || "Ошибка"; return; }
    myAvatar = data.avatar || "";
    renderAvatarInto($("profileAvatarBig"), myUsername, myAvatar);
    updateMyAvatarUI();
    $("profileMsg").style.color = "#4caf50"; $("profileMsg").textContent = "Фото обновлено";
  } catch { $("profileMsg").style.color = "#f44336"; $("profileMsg").textContent = "Сервер не отвечает"; }
}

function resizeAndProcess(file, callback, maxSize = 256) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height) { if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; } }
      else { if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; } }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ---- USER PROFILES ----
async function fetchUserProfile(username) {
  if (userProfileCache[username]) return userProfileCache[username];
  try {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    userProfileCache[username] = data;
    return data;
  } catch { return null; }
}

// ---- RECENT CHATS ----
function recentChatsKey() { return `tunduk_recent_${myUsername}`; }

function getRecentChats() {
  try {
    const raw = localStorage.getItem(recentChatsKey());
    let list = raw ? JSON.parse(raw) : [];
    const seen = new Set();
    const migrated = [];
    for (const entry of list) {
      const key = entry.includes(":") ? entry : `user:${entry}`;
      if (seen.has(key)) continue;
      seen.add(key);
      migrated.push(key);
    }
    if (JSON.stringify(migrated) !== JSON.stringify(list)) {
      localStorage.setItem(recentChatsKey(), JSON.stringify(migrated));
    }
    return migrated;
  } catch { return []; }
}

function addRecentChat(id, type) {
  const newKey = `${type}:${id}`;
  let list = getRecentChats().filter(item => {
    if (item === newKey) return false;
    if (type === "user" && item === String(id)) return false;
    return true;
  });
  list.unshift(newKey);
  list = list.slice(0, 50);
  localStorage.setItem(recentChatsKey(), JSON.stringify(list));
}

async function renderRecentChats() {
  const listEl = $("recentChatsList");
  const empty  = $("emptyState");
  const recent = getRecentChats();

  if (recent.length === 0) { listEl.innerHTML = ""; empty.style.display = "flex"; return; }
  empty.style.display = "none";
  listEl.innerHTML = "";

  for (const key of recent) {
    const colonIdx = key.indexOf(":");
    const type = colonIdx !== -1 ? key.slice(0, colonIdx) : "user";
    const id   = colonIdx !== -1 ? key.slice(colonIdx + 1) : key;
    let div = null;

    if (type === "user") {
      const profile = userProfileCache[id] || await fetchUserProfile(id);
      if (!profile) continue;
      div = buildUserItem(profile);
    } else if (type === "channel") {
      const ch = await fetchChannelById(parseInt(id));
      if (!ch) continue;
      div = buildChannelItem(ch);
    } else if (type === "group") {
      const gr = await fetchGroupById(parseInt(id));
      if (!gr) continue;
      div = buildGroupItem(gr);
    }
    if (div) listEl.appendChild(div);
  }
}

// ---- BUILD LIST ITEMS ----
function buildUserItem(u) {
  const div = document.createElement("div");
  div.className = "userItem";
  const av = document.createElement("div"); av.className = "avatar small";
  renderAvatarInto(av, u.username, u.avatar);
  const txt = document.createElement("div"); txt.className = "userItemText";
  const name = document.createElement("span"); name.textContent = u.username;
  txt.appendChild(name);
  if (u.bio) { const bio = document.createElement("span"); bio.className = "userItemBio"; bio.textContent = u.bio; txt.appendChild(bio); }
  div.appendChild(av); div.appendChild(txt);
  div.onclick = () => { closeSearch(); openUserChat(u.username); };
  return div;
}

function buildChannelItem(ch) {
  const div = document.createElement("div"); div.className = "userItem";
  const av = document.createElement("div"); av.className = "avatar small";
  renderAvatarInto(av, ch.name, ch.avatar);
  const txt = document.createElement("div"); txt.className = "userItemText";
  const name = document.createElement("span"); name.textContent = ch.name; txt.appendChild(name);
  const handle = document.createElement("span"); handle.className = "userItemHandle"; handle.textContent = `@${ch.handle}`; txt.appendChild(handle);
  const badge = document.createElement("span"); badge.className = "userItemType"; badge.textContent = "Канал";
  div.appendChild(av); div.appendChild(txt); div.appendChild(badge);
  div.onclick = () => { closeSearch(); openChannelChat(ch); };
  return div;
}

function buildGroupItem(gr) {
  const div = document.createElement("div"); div.className = "userItem";
  const av = document.createElement("div"); av.className = "avatar small";
  renderAvatarInto(av, gr.name, gr.avatar);
  const txt = document.createElement("div"); txt.className = "userItemText";
  const name = document.createElement("span"); name.textContent = gr.name; txt.appendChild(name);
  if (gr.handle) { const handle = document.createElement("span"); handle.className = "userItemHandle"; handle.textContent = `@${gr.handle}`; txt.appendChild(handle); }
  const badge = document.createElement("span"); badge.className = "userItemType"; badge.textContent = "Группа";
  div.appendChild(av); div.appendChild(txt); div.appendChild(badge);
  div.onclick = () => { closeSearch(); openGroupChat(gr); };
  return div;
}

// ---- SEARCH ----
function openSearch() {
  $("searchPanel").classList.add("active");
  $("searchInput").value = "";
  $("searchResult").innerHTML = `<div class="searchHint">Введи имя пользователя или @юзернейм канала/группы</div>`;
  setTimeout(() => $("searchInput").focus(), 100);
}
function closeSearch() { $("searchPanel").classList.remove("active"); }

let searchDebounce = null;
async function onSearchInput() {
  const query = $("searchInput").value.trim();
  clearTimeout(searchDebounce);
  if (!query) { $("searchResult").innerHTML = `<div class="searchHint">Введи имя пользователя или @юзернейм</div>`; return; }
  searchDebounce = setTimeout(async () => {
    const resultDiv = $("searchResult");
    resultDiv.innerHTML = "";
    if (query.startsWith("@")) {
      const handle = query.slice(1).toLowerCase();
      const ch = await fetchChannelByHandle(handle);
      if (ch) { resultDiv.appendChild(buildChannelItem(ch)); return; }
      const gr = await fetchGroupByHandle(handle);
      if (gr) { resultDiv.appendChild(buildGroupItem(gr)); return; }
      resultDiv.innerHTML = `<div class="searchHint">Не найдено</div>`; return;
    }
    if (query === myUsername) { resultDiv.innerHTML = `<div class="searchHint">Это твой аккаунт</div>`; return; }
    const profile = await fetchUserProfile(query);
    if (!profile) { resultDiv.innerHTML = `<div class="searchHint">Пользователь не найден</div>`; return; }
    resultDiv.appendChild(buildUserItem(profile));
  }, 350);
}

// ---- API HELPERS ----
async function fetchChannelByHandle(handle) {
  try { const res = await fetch(`${API_BASE}/channels/handle/${encodeURIComponent(handle)}`, { headers: { Authorization: `Bearer ${token}` } }); return res.ok ? await res.json() : null; } catch { return null; }
}
async function fetchGroupByHandle(handle) {
  try { const res = await fetch(`${API_BASE}/groups/handle/${encodeURIComponent(handle)}`, { headers: { Authorization: `Bearer ${token}` } }); return res.ok ? await res.json() : null; } catch { return null; }
}
async function fetchChannelById(id) {
  try { const res = await fetch(`${API_BASE}/channels/${id}`, { headers: { Authorization: `Bearer ${token}` } }); return res.ok ? await res.json() : null; } catch { return null; }
}
async function fetchGroupById(id) {
  try { const res = await fetch(`${API_BASE}/groups/${id}`, { headers: { Authorization: `Bearer ${token}` } }); return res.ok ? await res.json() : null; } catch { return null; }
}
async function fetchMyChannels() {
  try { const res = await fetch(`${API_BASE}/channels/my`, { headers: { Authorization: `Bearer ${token}` } }); return res.ok ? await res.json() : []; } catch { return []; }
}
async function fetchMyGroups() {
  try { const res = await fetch(`${API_BASE}/groups/my`, { headers: { Authorization: `Bearer ${token}` } }); return res.ok ? await res.json() : []; } catch { return []; }
}
async function fetchChannelMembers(id) {
  try { const res = await fetch(`${API_BASE}/channels/${id}/members`, { headers: { Authorization: `Bearer ${token}` } }); return res.ok ? await res.json() : []; } catch { return []; }
}
async function fetchGroupMembers(id) {
  try { const res = await fetch(`${API_BASE}/groups/${id}/members`, { headers: { Authorization: `Bearer ${token}` } }); return res.ok ? await res.json() : []; } catch { return []; }
}

// ---- CHAT OPEN ----
async function openUserChat(username) {
  currentChatWith = username; currentChatType = "user"; currentChatId = null; currentChatIsAdmin = false; currentChatIsOwner = false;
  $("chatWithLabel").textContent = username; $("chatSubLabel").textContent = "";
  $("usersPanel").classList.add("hidden");
  $("chatPanel").classList.add("active");
  $("inputBar").classList.remove("readonly");
  if ($("membersBtn")) $("membersBtn").classList.add("hidden");
  const profile = await fetchUserProfile(username);
  renderAvatarInto($("chatAvatarSmall"), username, profile ? profile.avatar : "");
  addRecentChat(username, "user");
  await loadUserHistory(username);
}

async function openChannelChat(ch) {
  currentChatWith = null; currentChatType = "channel"; currentChatId = ch.id;
  currentChatIsOwner = ch.owner_username === myUsername;

  const myChannels = await fetchMyChannels();
  const already = myChannels.find(c => c.id === ch.id);
  if (!already && ch.is_public) {
    await fetch(`${API_BASE}/channels/${ch.id}/join`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  }
  const fresh = await fetchChannelById(ch.id);
  currentChatIsAdmin = fresh ? fresh.is_admin || currentChatIsOwner : currentChatIsOwner;

  $("chatWithLabel").textContent = ch.name;
  $("chatSubLabel").textContent  = `@${ch.handle} · канал`;
  $("usersPanel").classList.add("hidden");
  $("chatPanel").classList.add("active");
  currentChatIsAdmin ? $("inputBar").classList.remove("readonly") : $("inputBar").classList.add("readonly");
  if ($("membersBtn")) $("membersBtn").classList.remove("hidden");
  renderAvatarInto($("chatAvatarSmall"), ch.name, ch.avatar);
  addRecentChat(ch.id, "channel");
  await loadChannelHistory(ch.id);
}

async function openGroupChat(gr) {
  currentChatWith = null; currentChatType = "group"; currentChatId = gr.id;
  currentChatIsOwner = gr.owner_username === myUsername;

  const myGroups = await fetchMyGroups();
  const already = myGroups.find(g => g.id === gr.id);
  if (!already && gr.is_public) {
    await fetch(`${API_BASE}/groups/${gr.id}/join`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  }
  const fresh = await fetchGroupById(gr.id);
  currentChatIsAdmin = fresh ? fresh.is_admin || currentChatIsOwner : currentChatIsOwner;

  $("chatWithLabel").textContent = gr.name;
  $("chatSubLabel").textContent  = gr.handle ? `@${gr.handle} · группа` : "группа";
  $("usersPanel").classList.add("hidden");
  $("chatPanel").classList.add("active");
  $("inputBar").classList.remove("readonly");
  if ($("membersBtn")) $("membersBtn").classList.remove("hidden");
  renderAvatarInto($("chatAvatarSmall"), gr.name, gr.avatar);
  addRecentChat(gr.id, "group");
  await loadGroupHistory(gr.id);
}

function closeChat() {
  currentChatWith = null; currentChatType = "user"; currentChatId = null;
  $("chatPanel").classList.remove("active");
  $("usersPanel").classList.remove("hidden");
  renderRecentChats();
}

// ---- MEMBERS / ADMIN MANAGEMENT ----
function openMembers() {
  if (currentChatType !== "channel" && currentChatType !== "group") return;
  $("membersScreen").classList.add("active");
  renderMembersList();
}
function closeMembers() { $("membersScreen").classList.remove("active"); }

async function renderMembersList() {
  const listEl = $("membersList");
  listEl.innerHTML = `<div style="text-align:center;color:#666;padding:20px;">Загрузка...</div>`;
  const members = currentChatType === "channel"
    ? await fetchChannelMembers(currentChatId)
    : await fetchGroupMembers(currentChatId);

  listEl.innerHTML = "";
  if (members.length === 0) { listEl.innerHTML = `<div style="text-align:center;color:#666;padding:20px;">Нет участников</div>`; return; }

  for (const m of members) {
    const row = document.createElement("div");
    row.className = "memberRow";

    const av = document.createElement("div"); av.className = "avatar small";
    renderAvatarInto(av, m.username, "");

    const info = document.createElement("div"); info.className = "memberInfo";
    const nameEl = document.createElement("span"); nameEl.textContent = m.username;
    info.appendChild(nameEl);
    if (m.is_owner) {
      const badge = document.createElement("span"); badge.className = "memberBadge owner"; badge.textContent = "Владелец";
      info.appendChild(badge);
    } else if (m.is_admin) {
      const badge = document.createElement("span"); badge.className = "memberBadge admin"; badge.textContent = "Админ";
      info.appendChild(badge);
    }

    row.appendChild(av);
    row.appendChild(info);

    // Только владелец может назначать/снимать админов, и не может менять сам себя
    if (currentChatIsOwner && !m.is_owner) {
      const toggleBtn = document.createElement("button");
      toggleBtn.className = "memberAdminToggle";
      toggleBtn.textContent = m.is_admin ? "Снять админа" : "Назначить админом";
      toggleBtn.onclick = () => toggleAdmin(m.username, !m.is_admin);
      row.appendChild(toggleBtn);
    }

    listEl.appendChild(row);
  }
}

async function toggleAdmin(username, makeAdmin) {
  const url = currentChatType === "channel"
    ? `${API_BASE}/channels/${currentChatId}/set-admin`
    : `${API_BASE}/groups/${currentChatId}/set-admin`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username, is_admin: makeAdmin }),
    });
    if (res.ok) {
      renderMembersList();
    } else {
      const data = await res.json();
      alert(data.detail || "Ошибка");
    }
  } catch { alert("Сервер не отвечает"); }
}

// ---- HISTORY ----
async function loadUserHistory(username) {
  $("messages").innerHTML = `<div style="text-align:center;color:#666;font-size:13px;padding:20px;">Загрузка...</div>`;
  try {
    const res = await fetch(`${API_BASE}/messages/${encodeURIComponent(username)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { logout(); return; }
    const history = await res.json();
    messageCache[`user:${username}`] = history.map(m => ({ content: m.content, timestamp: m.timestamp, mine: myUserId !== null && m.sender_id === myUserId, delivered: m.delivered }));
    renderMessages(`user:${username}`);
  } catch { $("messages").innerHTML = `<div style="text-align:center;color:#f44336;padding:20px;">Ошибка загрузки</div>`; }
}

async function loadChannelHistory(id) {
  $("messages").innerHTML = `<div style="text-align:center;color:#666;font-size:13px;padding:20px;">Загрузка...</div>`;
  try {
    const res = await fetch(`${API_BASE}/channels/${id}/messages`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { $("messages").innerHTML = `<div style="text-align:center;color:#f44336;padding:20px;">Нет доступа</div>`; return; }
    const history = await res.json();
    messageCache[`channel:${id}`] = history.map(m => ({ content: m.content, timestamp: m.timestamp, mine: m.sender_username === myUsername, senderName: m.sender_username }));
    renderMessages(`channel:${id}`);
  } catch { $("messages").innerHTML = `<div style="text-align:center;color:#f44336;padding:20px;">Ошибка</div>`; }
}

async function loadGroupHistory(id) {
  $("messages").innerHTML = `<div style="text-align:center;color:#666;font-size:13px;padding:20px;">Загрузка...</div>`;
  try {
    const res = await fetch(`${API_BASE}/groups/${id}/messages`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { $("messages").innerHTML = `<div style="text-align:center;color:#f44336;padding:20px;">Нет доступа</div>`; return; }
    const history = await res.json();
    messageCache[`group:${id}`] = history.map(m => ({ content: m.content, timestamp: m.timestamp, mine: m.sender_username === myUsername, senderName: m.sender_username }));
    renderMessages(`group:${id}`);
  } catch { $("messages").innerHTML = `<div style="text-align:center;color:#f44336;padding:20px;">Ошибка</div>`; }
}

function renderMessages(cacheKey) {
  const container = $("messages");
  container.innerHTML = "";
  (messageCache[cacheKey] || []).forEach(m => addMessageBubble(m.content, m.mine, m.timestamp, m.delivered, m.senderName));
  container.scrollTop = container.scrollHeight;
}

function addMessageBubble(content, mine, timestamp, delivered, senderName) {
  const container = $("messages");
  const div = document.createElement("div");
  div.className = "msg " + (mine ? "mine" : "theirs");
  const time = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  let tick = "";
  if (mine && currentChatType === "user") tick = delivered ? `<span class="tick delivered">${ICONS.tickTwo}</span>` : `<span class="tick">${ICONS.tickOne}</span>`;
  let nameHtml = "";
  if (!mine && senderName && currentChatType !== "user") nameHtml = `<div class="senderName">${escapeHtml(senderName)}</div>`;
  div.innerHTML = `${nameHtml}${escapeHtml(content)}<div class="meta">${time}${tick}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str; return d.innerHTML; }

// ---- SEND ----
async function sendMessage() {
  const input = $("msgInput"); const content = input.value.trim(); if (!content) return;
  if (currentChatType === "user") {
    if (!ws || ws.readyState !== WebSocket.OPEN) { alert("Нет соединения"); return; }
    ws.send(JSON.stringify({ receiver: currentChatWith, content }));
    input.value = ""; return;
  }
  if (currentChatType === "channel") {
    if (!currentChatIsAdmin) return;
    const res = await fetch(`${API_BASE}/channels/${currentChatId}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ content }) });
    if (res.ok) { const msg = await res.json(); const key = `channel:${currentChatId}`; if (!messageCache[key]) messageCache[key] = []; messageCache[key].push({ content: msg.content, timestamp: msg.timestamp, mine: true, senderName: myUsername }); addMessageBubble(msg.content, true, msg.timestamp, false, myUsername); input.value = ""; } return;
  }
  if (currentChatType === "group") {
    const res = await fetch(`${API_BASE}/groups/${currentChatId}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ content }) });
    if (res.ok) { const msg = await res.json(); const key = `group:${currentChatId}`; if (!messageCache[key]) messageCache[key] = []; messageCache[key].push({ content: msg.content, timestamp: msg.timestamp, mine: true, senderName: myUsername }); addMessageBubble(msg.content, true, msg.timestamp, false, myUsername); input.value = ""; }
  }
}

// ---- SOUND ----
let audioCtx = null;
function playIncomingSound() {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.value = 880; osc.type = "sine";
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    osc.start(); osc.stop(audioCtx.currentTime + 0.25);
  } catch {}
}

// ---- BROWSER NOTIFICATIONS ----
function requestNotifyPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function showIncomingNotification(fromUsername, content) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible" && currentChatType === "user" && currentChatWith === fromUsername) return;
  try {
    const n = new Notification(`${fromUsername} · Tunduk`, { body: content, tag: `tunduk-${fromUsername}` });
    n.onclick = () => { window.focus(); closeSearch(); openUserChat(fromUsername); n.close(); };
  } catch {}
}

// ---- WEBSOCKET ----
function connectWebSocket() {
  if (ws) ws.close();
  ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);
  ws.onopen  = () => setStatus("онлайн", true);
  ws.onclose = () => { setStatus("отключено, переподключение...", false); if (token) setTimeout(connectWebSocket, 3000); };
  ws.onerror = () => setStatus("ошибка соединения", false);
  ws.onmessage = event => {
    let data; try { data = JSON.parse(event.data); } catch { return; }
    if (data.type === "error") { alert("Ошибка: " + data.detail); return; }
    if (data.type === "message") {
      const other = data.sender; const key = `user:${other}`;
      if (!messageCache[key]) messageCache[key] = [];
      messageCache[key].push({ content: data.content, mine: false, timestamp: data.timestamp });

      const wasNewChat = !getRecentChats().includes(key);
      addRecentChat(other, "user"); // сохраняем чат у получателя автоматически

      if (currentChatType === "user" && currentChatWith === other) {
        addMessageBubble(data.content, false, data.timestamp);
      } else {
        // Чат не открыт прямо сейчас — показываем уведомление и обновляем список
        showIncomingNotification(other, data.content);
        renderRecentChats();
      }
      playIncomingSound();
    }
    if (data.type === "ack") {
      const other = data.receiver; const key = `user:${other}`;
      if (!messageCache[key]) messageCache[key] = [];
      messageCache[key].push({ content: data.content, mine: true, timestamp: data.timestamp, delivered: data.delivered });
      if (currentChatType === "user" && currentChatWith === other) addMessageBubble(data.content, true, data.timestamp, data.delivered);
    }
  };
}

// ---- SETTINGS ----
function openSettings() { $("settingsScreen").classList.add("active"); renderSoundToggle(); renderWallpaperGrid(); }
function closeSettings() { $("settingsScreen").classList.remove("active"); }
function renderSoundToggle() { $("soundToggle").classList.toggle("on", soundEnabled); }
function toggleSound() { soundEnabled = !soundEnabled; localStorage.setItem("tunduk_sound", soundEnabled ? "on" : "off"); renderSoundToggle(); }
function renderWallpaperGrid() {
  const grid = $("wallpaperGrid"); grid.innerHTML = "";
  WALLPAPERS.forEach(wp => {
    const div = document.createElement("div");
    div.className = "wallpaperSwatch" + (wp.id === currentWallpaper ? " active" : "");
    if (wp.size) { div.style.backgroundColor = wp.base || "#121317"; div.style.backgroundImage = wp.css; div.style.backgroundSize = wp.size; }
    else { div.style.background = wp.css; }
    div.onclick = () => selectWallpaper(wp.id); grid.appendChild(div);
  });
}
function selectWallpaper(id) { currentWallpaper = id; localStorage.setItem("tunduk_wallpaper", id); renderWallpaperGrid(); applyWallpaper(); }
function applyWallpaper() {
  const wp = WALLPAPERS.find(w => w.id === currentWallpaper) || WALLPAPERS[0];
  const el = $("messages");
  if (wp.size) { el.style.backgroundColor = wp.base || "#121317"; el.style.backgroundImage = wp.css; el.style.backgroundSize = wp.size; }
  else { el.style.backgroundImage = wp.css.startsWith("linear") || wp.css.startsWith("radial") ? wp.css : "none"; el.style.backgroundColor = wp.css.startsWith("#") ? wp.css : "#121317"; }
}

// ---- FAB ----
let fabOpen = false;
function toggleFab() { fabOpen = !fabOpen; $("fab").classList.toggle("open", fabOpen); $("fabMenu").classList.toggle("hidden", !fabOpen); }
function closeFab() { fabOpen = false; $("fab").classList.remove("open"); $("fabMenu").classList.add("hidden"); }

// ---- CREATE CHANNEL ----
let channelIsPublic = true;
function openCreateChannel() {
  closeFab();
  $("createChannelScreen").classList.add("active");
  $("channelNameInput").value = ""; $("channelHandleInput").value = ""; $("channelDescInput").value = "";
  $("createChannelMsg").textContent = ""; channelAvatarData = "";
  $("channelAvatarPreview").style.background = "#2c2f37";
  $("channelAvatarPreview").innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36" style="color:#6b6f7a"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.64 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.55 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
  setChannelType(true);
}
function closeCreateChannel() { $("createChannelScreen").classList.remove("active"); }
function setChannelType(isPublic) {
  channelIsPublic = isPublic;
  $("channelTypePublic").classList.toggle("active", isPublic);
  $("channelTypePrivate").classList.toggle("active", !isPublic);
  $("channelHandleWrap").classList.toggle("hidden", !isPublic);
}
async function createChannel() {
  const name = $("channelNameInput").value.trim();
  const handle = $("channelHandleInput").value.trim().toLowerCase().replace(/^@/, "");
  const desc = $("channelDescInput").value.trim();
  const msgEl = $("createChannelMsg");
  if (!name) { msgEl.style.color = "#f44336"; msgEl.textContent = "Укажи название"; return; }
  if (channelIsPublic && !handle) { msgEl.style.color = "#f44336"; msgEl.textContent = "Укажи юзернейм"; return; }
  msgEl.style.color = "#4caf50"; msgEl.textContent = "Создание...";
  try {
    const res = await fetch(`${API_BASE}/channels`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, handle: handle || `ch_${Date.now()}`, is_public: channelIsPublic, avatar: channelAvatarData, description: desc }) });
    const data = await res.json();
    if (!res.ok) { msgEl.style.color = "#f44336"; msgEl.textContent = data.detail || "Ошибка"; return; }
    msgEl.textContent = "Канал создан!";
    setTimeout(() => { closeCreateChannel(); openChannelChat(data); }, 800);
  } catch { msgEl.style.color = "#f44336"; msgEl.textContent = "Сервер не отвечает"; }
}

// ---- CREATE GROUP ----
let groupIsPublic = false;
function openCreateGroup() {
  closeFab();
  $("createGroupScreen").classList.add("active");
  $("groupNameInput").value = ""; $("groupHandleInput").value = ""; $("groupDescInput").value = "";
  $("createGroupMsg").textContent = ""; groupAvatarData = "";
  $("groupAvatarPreview").style.background = "#2c2f37";
  $("groupAvatarPreview").innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36" style="color:#6b6f7a"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
  setGroupType(false);
}
function closeCreateGroup() { $("createGroupScreen").classList.remove("active"); }
function setGroupType(isPublic) {
  groupIsPublic = isPublic;
  $("groupTypePublic").classList.toggle("active", isPublic);
  $("groupTypePrivate").classList.toggle("active", !isPublic);
  $("groupHandleWrap").classList.toggle("hidden", !isPublic);
}
async function createGroup() {
  const name = $("groupNameInput").value.trim();
  const handle = $("groupHandleInput").value.trim().toLowerCase().replace(/^@/, "");
  const desc = $("groupDescInput").value.trim();
  const msgEl = $("createGroupMsg");
  if (!name) { msgEl.style.color = "#f44336"; msgEl.textContent = "Укажи название"; return; }
  if (groupIsPublic && !handle) { msgEl.style.color = "#f44336"; msgEl.textContent = "Укажи юзернейм"; return; }
  msgEl.style.color = "#4caf50"; msgEl.textContent = "Создание...";
  try {
    const res = await fetch(`${API_BASE}/groups`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, handle: groupIsPublic ? handle : null, is_public: groupIsPublic, avatar: groupAvatarData, description: desc }) });
    const data = await res.json();
    if (!res.ok) { msgEl.style.color = "#f44336"; msgEl.textContent = data.detail || "Ошибка"; return; }
    msgEl.textContent = "Группа создана!";
    setTimeout(() => { closeCreateGroup(); openGroupChat(data); }, 800);
  } catch { msgEl.style.color = "#f44336"; msgEl.textContent = "Сервер не отвечает"; }
}

// ---- KEEP-ALIVE ----
setInterval(() => { fetch(`${API_BASE}/health`).catch(() => {}); }, 10 * 60 * 1000);

// ---- ПЕРИОДИЧЕСКАЯ ДОСИНХРОНИЗАЦИЯ КОНТАКТОВ ----
// На случай если WS был отключен, когда пришло сообщение
setInterval(() => { if (token) syncContactsFromServer(); }, 60 * 1000);

// ---- EVENTS ----
injectIcons();
applyWallpaper();
requestNotifyPermission();

$("loginBtn").onclick    = login;
$("registerBtn").onclick = register;
$("logoutBtn").onclick   = logout;
$("backBtn").onclick     = closeChat;
$("sendBtn").onclick     = sendMessage;
$("msgInput").addEventListener("keypress", e => { if (e.key === "Enter") sendMessage(); });
$("searchBtn").onclick     = openSearch;
$("searchBackBtn").onclick = closeSearch;
$("searchInput").addEventListener("input", onSearchInput);
$("meBlock").onclick        = openMyProfile;
$("profileBackBtn").onclick = closeProfile;
$("saveProfileBtn").onclick = saveProfile;
$("avatarEditBtn").onclick  = pickAvatarFile;
$("avatarFileInput").addEventListener("change", onAvatarFileChosen);
$("settingsBtn").onclick     = openSettings;
$("settingsBackBtn").onclick = closeSettings;
$("soundToggleRow").onclick  = toggleSound;

if ($("membersBtn"))     $("membersBtn").onclick     = openMembers;
if ($("membersBackBtn")) $("membersBackBtn").onclick = closeMembers;

$("fab").onclick        = toggleFab;
$("fabContact").onclick = () => { closeFab(); openSearch(); };
$("fabChannel").onclick = openCreateChannel;
$("fabGroup").onclick   = openCreateGroup;

$("channelTypePublic").onclick    = () => setChannelType(true);
$("channelTypePrivate").onclick   = () => setChannelType(false);
$("createChannelBackBtn").onclick = closeCreateChannel;
$("createChannelBtn").onclick     = createChannel;
$("channelAvatarEditBtn").onclick = () => $("channelAvatarInput").click();
$("channelAvatarInput").addEventListener("change", e => {
  const file = e.target.files[0]; if (!file) return;
  resizeAndProcess(file, dataUrl => { channelAvatarData = dataUrl; $("channelAvatarPreview").innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`; $("channelAvatarPreview").style.background = "none"; });
});

$("groupTypePublic").onclick    = () => setGroupType(true);
$("groupTypePrivate").onclick   = () => setGroupType(false);
$("createGroupBackBtn").onclick = closeCreateGroup;
$("createGroupBtn").onclick     = createGroup;
$("groupAvatarEditBtn").onclick = () => $("groupAvatarInput").click();
$("groupAvatarInput").addEventListener("change", e => {
  const file = e.target.files[0]; if (!file) return;
  resizeAndProcess(file, dataUrl => { groupAvatarData = dataUrl; $("groupAvatarPreview").innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`; $("groupAvatarPreview").style.background = "none"; });
});

document.addEventListener("click", e => {
  if (fabOpen && !$("fab").contains(e.target) && !$("fabMenu").contains(e.target)) closeFab();
});

// ---- INIT ----
if (token && myUsername) { showApp(); } else { showAuth(); }
