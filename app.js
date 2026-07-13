// ======= НАСТРОЙКИ =======
const API_BASE = "https://tunduk-messenger.onrender.com";
const WS_BASE  = "wss://tunduk-messenger.onrender.com";
const EMAILJS_SERVICE_ID  = "service_j6m6xnp";
const EMAILJS_TEMPLATE_ID = "template_54zk08p";
const EMAILJS_PUBLIC_KEY  = "UMCdIt1zmhOihzHmr";
// ==========================

let token        = localStorage.getItem("tunduk_token")    || null;
let refreshToken = localStorage.getItem("tunduk_refresh")  || null;
let myUsername   = localStorage.getItem("tunduk_username") || null;
let myUserId     = null;
let myBio        = "";
let myAvatar     = "";
let myFirstName  = "";
let myLastName   = "";
let ws           = null;
let currentChatWith   = null;
let currentChatType   = "user";
let currentChatId     = null;
let currentChatIsAdmin = false;
let currentChatIsOwner = false;
let messageCache      = {};
let userProfileCache  = {};
let chatPagination    = {}; // cacheKey -> { hasMore, oldestId, loading }
const MESSAGES_PAGE_SIZE = 50;

// ---- АВТО-РЕФРЕШ ТОКЕНА ----
// Оборачиваем глобальный fetch один раз, поэтому все существующие "fetch(...)" по
// коду ниже (их десятки) автоматически получают эту логику без переписывания каждого.
// В этом API 401 отдаёт только протухший/невалидный access-токен (get_current_user) —
// логин/регистрация на неверные данные отвечают 400, так что триггерить рефреш именно
// на 401 безопасно и не задевает обычные формы.
const _rawFetch = window.fetch.bind(window);
let _refreshInFlight = null;

async function refreshAccessToken() {
  if (_refreshInFlight) return _refreshInFlight;
  if (!refreshToken) return false;
  _refreshInFlight = (async () => {
    try {
      const res = await _rawFetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      token = data.access_token;
      refreshToken = data.refresh_token;
      localStorage.setItem("tunduk_token", token);
      localStorage.setItem("tunduk_refresh", refreshToken);
      return true;
    } catch { return false; }
  })();
  const ok = await _refreshInFlight;
  _refreshInFlight = null;
  return ok;
}

window.fetch = async function (input, init) {
  let res = await _rawFetch(input, init);
  if (res.status === 401 && refreshToken) {
    const ok = await refreshAccessToken();
    if (ok) {
      const retryInit = { ...(init || {}) };
      if (retryInit.headers && (retryInit.headers.Authorization || retryInit.headers.authorization)) {
        retryInit.headers = { ...retryInit.headers, Authorization: `Bearer ${token}` };
      }
      res = await _rawFetch(input, retryInit);
    }
    if (res.status === 401 && token) logout();
  }
  return res;
};

// подстраховка: обновляем access-токен заранее, чтобы он не успевал протухать
// между запросами и WebSocket-реконнект тоже всегда шёл со свежим токеном
setInterval(() => { if (token && refreshToken) refreshAccessToken(); }, 45 * 60 * 1000);

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
  info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  attach:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="19" height="19"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
  mic:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="19" height="19"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  trash:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="17" height="17"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  play:    `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  pause:   `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  phone:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127 1.03.36 2.04.7 3a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.96.34 1.97.57 3 .7A2 2 0 0 1 22 16.92z"/></svg>`,
  micOff:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  headphones:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
  headphonesOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  plus:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  close:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  sticker: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="19" height="19"><path d="M15 3H7a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-6"/><path d="M15 3l6 6h-4a2 2 0 0 1-2-2z"/><circle cx="9" cy="10" r="1"/><circle cx="14" cy="10" r="1"/><path d="M8.5 14.5c1 1 5 1 6 0"/></svg>`,
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
  $("joinPreviewBackBtn").innerHTML = ICONS.back;
  $("attachBtn").innerHTML = ICONS.attach;
  $("micBtn").innerHTML = ICONS.mic;
  $("cancelRecordingBtn").innerHTML = ICONS.trash;
  $("sendRecordingBtn").innerHTML = ICONS.send;
  $("callBtn").innerHTML = ICONS.phone;
  $("callAcceptBtn").innerHTML = ICONS.phone;
  $("callDeclineBtn").innerHTML = ICONS.phone;
  $("callHangupBtn").innerHTML = ICONS.phone;
  $("callMuteBtn").innerHTML = ICONS.mic;
  $("callDeafenBtn").innerHTML = ICONS.headphones;
  $("stickerBtn").innerHTML = ICONS.sticker;
  $("stickersBackBtn").innerHTML = ICONS.back;
  $("createPackBtn").innerHTML = ICONS.plus;
  $("stickerPackBackBtn").innerHTML = ICONS.back;
  $("deletePackBtn").innerHTML = ICONS.trash;
  $("stickerPickerBackBtn").innerHTML = ICONS.back;
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
    el.innerHTML = `<img src="${escapeAttr(avatarDataUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
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

// ---- AUTH: экраны ----
function showAuthChoice() {
  $("authChoice").classList.remove("hidden");
  $("loginForm").classList.add("hidden");
  $("registerForm").classList.add("hidden");
  $("verifyForm").classList.add("hidden");
}
function showLoginForm() {
  $("authChoice").classList.add("hidden");
  $("loginForm").classList.remove("hidden");
  $("registerForm").classList.add("hidden");
  $("verifyForm").classList.add("hidden");
  $("loginError").textContent = "";
}
function showRegisterForm() {
  $("authChoice").classList.add("hidden");
  $("loginForm").classList.add("hidden");
  $("registerForm").classList.remove("hidden");
  $("verifyForm").classList.add("hidden");
  $("registerError").textContent = "";
}
function showVerifyForm(email) {
  $("authChoice").classList.add("hidden");
  $("loginForm").classList.add("hidden");
  $("registerForm").classList.add("hidden");
  $("verifyForm").classList.remove("hidden");
  $("verifyEmailLabel").textContent = email;
  $("verifyError").textContent = "";
  $("verifyCode").value = "";
}

// ---- ЮЗЕРНЕЙМЫ/HANDLE: только латиница, цифры, _ ----
function restrictToLatinHandle(el) {
  el.addEventListener("input", () => {
    const start = el.selectionStart;
    const cleaned = el.value.replace(/[^A-Za-z0-9_]/g, "");
    if (cleaned !== el.value) {
      const removedBefore = el.value.slice(0, start).replace(/[^A-Za-z0-9_]/g, "").length;
      el.value = cleaned;
      el.setSelectionRange(removedBefore, removedBefore);
    }
  });
}

// ---- AUTH: проверка занятости username в реальном времени ----
let usernameCheckDebounce = null;
let pendingRegistrationEmail = null;

async function onRegUsernameInput() {
  const username = $("regUsername").value.trim();
  const statusEl = $("regUsernameStatus");
  clearTimeout(usernameCheckDebounce);

  if (!username) { statusEl.textContent = ""; statusEl.className = "usernameStatus"; return; }
  if (username.length < 3) {
    statusEl.textContent = "мин. 3 симв.";
    statusEl.className = "usernameStatus taken";
    return;
  }

  statusEl.textContent = "проверка...";
  statusEl.className = "usernameStatus checking";

  usernameCheckDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`${API_BASE}/check-username/${encodeURIComponent(username)}`);
      const data = await res.json();
      if (data.available) {
        statusEl.textContent = "свободно";
        statusEl.className = "usernameStatus available";
      } else {
        statusEl.textContent = data.reason || "занято";
        statusEl.className = "usernameStatus taken";
      }
    } catch {
      statusEl.textContent = "";
      statusEl.className = "usernameStatus";
    }
  }, 400);
}

// ---- AUTH: регистрация шаг 1 — отправка данных, получение кода на почту ----
async function registerStart() {
  const firstName = $("regFirstName").value.trim();
  const lastName  = $("regLastName").value.trim();
  const email     = $("regEmail").value.trim();
  const username  = $("regUsername").value.trim();
  const password  = $("regPassword").value;
  const errEl     = $("registerError");
  const btn       = $("registerSubmitBtn");
  errEl.textContent = "";

  if (!firstName || !lastName) { errEl.textContent = "Укажи имя и фамилию"; return; }
  if (!email) { errEl.textContent = "Укажи почту"; return; }
  if (!username || username.length < 3) { errEl.textContent = "Имя пользователя минимум 3 символа"; return; }
  if (!password || password.length < 4) { errEl.textContent = "Пароль минимум 4 символа"; return; }

  if (btn.disabled) return; // защита от двойного нажатия
  btn.disabled = true;
  btn.textContent = "Отправка...";

  try {
    const res = await fetch(`${API_BASE}/register/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, first_name: firstName, last_name: lastName, username, password }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.detail || "Ошибка регистрации"; return; }

    // Бэкенд сгенерировал код, теперь отправляем письмо через EmailJS с фронтенда
    btn.textContent = "Отправка письма...";
    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email: email,
        first_name: firstName,
        code: data.code,
      }, EMAILJS_PUBLIC_KEY);
    } catch (emailErr) {
      errEl.textContent = "Не удалось отправить письмо. Попробуй ещё раз.";
      return;
    }

    pendingRegistrationEmail = email;
    showVerifyForm(email);
  } catch (e) {
    errEl.textContent = "Сервер не отвечает: " + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Продолжить";
  }
}

// ---- AUTH: регистрация шаг 2 — подтверждение кода ----
async function registerVerify() {
  const code  = $("verifyCode").value.trim();
  const errEl = $("verifyError");
  errEl.textContent = "";

  if (!code) { errEl.textContent = "Введи код из письма"; return; }
  if (!pendingRegistrationEmail) { errEl.textContent = "Начни регистрацию заново"; showRegisterForm(); return; }

  try {
    const res = await fetch(`${API_BASE}/register/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingRegistrationEmail, code }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.detail || "Неверный код"; return; }

    // Регистрация окончена — сразу логиним, используя данные, которые уже ввёл пользователь
    const email    = pendingRegistrationEmail;
    const username = $("regUsername").value.trim();
    const password = $("regPassword").value;
    await performLogin(email, username, password);
  } catch (e) {
    errEl.textContent = "Сервер не отвечает: " + e.message;
  }
}

// ---- AUTH: вход ----
async function loginSubmit() {
  const email    = $("loginEmail").value.trim();
  const username = $("loginUsername").value.trim();
  const password = $("loginPassword").value;
  const errEl    = $("loginError");
  errEl.textContent = "";

  if (!email || !username || !password) { errEl.textContent = "Заполни все поля"; return; }
  await performLogin(email, username, password, errEl);
}

async function performLogin(email, username, password, errEl) {
  const targetErrEl = errEl || $("verifyError");
  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    });
    const data = await res.json();
    if (!res.ok) { targetErrEl.textContent = data.detail || "Ошибка входа"; return; }
    token = data.access_token; refreshToken = data.refresh_token; myUsername = username;
    localStorage.setItem("tunduk_token", token);
    localStorage.setItem("tunduk_refresh", refreshToken);
    localStorage.setItem("tunduk_username", myUsername);
    showApp();
  } catch (e) {
    targetErrEl.textContent = "Сервер не отвечает: " + e.message;
  }
}

function logout() {
  if (ws) { ws.close(); ws = null; }
  if (refreshToken) { _rawFetch(`${API_BASE}/auth/logout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refreshToken }) }).catch(() => {}); }
  token = null; refreshToken = null; myUsername = null; myBio = ""; myAvatar = ""; myFirstName = ""; myLastName = "";
  localStorage.removeItem("tunduk_token");
  localStorage.removeItem("tunduk_refresh");
  localStorage.removeItem("tunduk_username");
  messageCache = {}; userProfileCache = {};
  pendingRegistrationEmail = null;
  setStatus("не подключено", false);
  showAuthChoice();
  showAuth();
}

// ---- MY PROFILE ----
async function loadMyId() {
  try {
    const res = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { logout(); return; }
    const me = await res.json();
    myUserId = me.id; myBio = me.bio || ""; myAvatar = me.avatar || "";
    myFirstName = me.first_name || ""; myLastName = me.last_name || "";
    updateMyAvatarUI();
  } catch (e) { console.error(e); }
}

function openMyProfile() {
  $("profileFullNameDisplay").textContent = [myFirstName, myLastName].filter(Boolean).join(" ") || myUsername;
  $("profileHandleDisplay").textContent = `@${myUsername}`;
  $("profileFirstNameInput").value = myFirstName;
  $("profileLastNameInput").value  = myLastName;
  $("profileUsernameInput").value = myUsername;
  $("profileBioInput").value      = myBio;
  renderAvatarInto($("profileAvatarBig"), myUsername, myAvatar);
  $("profileMsg").textContent = "";
  $("profileScreen").classList.add("active");
}

function closeProfile() { $("profileScreen").classList.remove("active"); }

async function saveProfile() {
  const newUsername  = $("profileUsernameInput").value.trim();
  const newFirstName = $("profileFirstNameInput").value.trim();
  const newLastName  = $("profileLastNameInput").value.trim();
  const newBio       = $("profileBioInput").value.trim();
  if (!newFirstName) { $("profileMsg").style.color = "#f44336"; $("profileMsg").textContent = "Укажи имя"; return; }
  if (!newLastName)  { $("profileMsg").style.color = "#f44336"; $("profileMsg").textContent = "Укажи фамилию"; return; }
  $("profileMsg").style.color = "#4caf50"; $("profileMsg").textContent = "Сохранение...";
  try {
    const res  = await fetch(`${API_BASE}/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: newUsername, first_name: newFirstName, last_name: newLastName, bio: newBio }),
    });
    const data = await res.json();
    if (!res.ok) { $("profileMsg").style.color = "#f44336"; $("profileMsg").textContent = data.detail || "Ошибка"; return; }
    myUsername = data.username; myBio = data.bio || ""; myAvatar = data.avatar || "";
    myFirstName = data.first_name || ""; myLastName = data.last_name || "";
    localStorage.setItem("tunduk_username", myUsername);
    $("meLabel").textContent = myUsername;
    $("profileFullNameDisplay").textContent = [myFirstName, myLastName].filter(Boolean).join(" ") || myUsername;
    $("profileHandleDisplay").textContent = `@${myUsername}`;
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

function buildChannelItem(ch, fromSearch = false) {
  const div = document.createElement("div"); div.className = "userItem";
  const av = document.createElement("div"); av.className = "avatar small";
  renderAvatarInto(av, ch.name, ch.avatar);
  const txt = document.createElement("div"); txt.className = "userItemText";
  const name = document.createElement("span"); name.textContent = ch.name; txt.appendChild(name);
  const handle = document.createElement("span"); handle.className = "userItemHandle"; handle.textContent = `@${ch.handle}`; txt.appendChild(handle);
  const badge = document.createElement("span"); badge.className = "userItemType"; badge.textContent = "Канал";
  div.appendChild(av); div.appendChild(txt); div.appendChild(badge);
  // Приватные каналы возвращаются поиском только если пользователь уже участник —
  // в этом случае превью не нужно, сразу открываем чат. Публичные — показываем превью.
  div.onclick = () => {
    closeSearch();
    if (fromSearch && ch.is_public) openJoinPreview(ch, "channel");
    else openChannelChat(ch);
  };
  return div;
}

function buildGroupItem(gr, fromSearch = false) {
  const div = document.createElement("div"); div.className = "userItem";
  const av = document.createElement("div"); av.className = "avatar small";
  renderAvatarInto(av, gr.name, gr.avatar);
  const txt = document.createElement("div"); txt.className = "userItemText";
  const name = document.createElement("span"); name.textContent = gr.name; txt.appendChild(name);
  if (gr.handle) { const handle = document.createElement("span"); handle.className = "userItemHandle"; handle.textContent = `@${gr.handle}`; txt.appendChild(handle); }
  const badge = document.createElement("span"); badge.className = "userItemType"; badge.textContent = "Группа";
  div.appendChild(av); div.appendChild(txt); div.appendChild(badge);
  div.onclick = () => {
    closeSearch();
    if (fromSearch && gr.is_public) openJoinPreview(gr, "group");
    else openGroupChat(gr);
  };
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
      if (ch) { resultDiv.appendChild(buildChannelItem(ch, true)); return; }
      const gr = await fetchGroupByHandle(handle);
      if (gr) { resultDiv.appendChild(buildGroupItem(gr, true)); return; }
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
  resetInputBar();
  currentChatWith = username; currentChatType = "user"; currentChatId = null; currentChatIsAdmin = false; currentChatIsOwner = false;
  $("chatWithLabel").textContent = username; $("chatSubLabel").textContent = "";
  $("usersPanel").classList.add("hidden");
  $("chatPanel").classList.add("active");
  $("inputBar").classList.remove("readonly");
  if ($("membersBtn")) $("membersBtn").classList.add("hidden");
  $("callBtn").classList.remove("hidden");
  const profile = await fetchUserProfile(username);
  renderAvatarInto($("chatAvatarSmall"), username, profile ? profile.avatar : "");
  addRecentChat(username, "user");
  await loadUserHistory(username);
}

async function openChannelChat(ch) {
  resetInputBar();
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
  $("callBtn").classList.add("hidden");
  renderAvatarInto($("chatAvatarSmall"), ch.name, ch.avatar);
  addRecentChat(ch.id, "channel");
  await loadChannelHistory(ch.id);
}

async function openGroupChat(gr) {
  resetInputBar();
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
  $("callBtn").classList.add("hidden");
  renderAvatarInto($("chatAvatarSmall"), gr.name, gr.avatar);
  addRecentChat(gr.id, "group");
  await loadGroupHistory(gr.id);
}

function closeChat() {
  resetInputBar();
  currentChatWith = null; currentChatType = "user"; currentChatId = null;
  $("chatPanel").classList.remove("active");
  $("usersPanel").classList.remove("hidden");
  renderRecentChats();
}

// ---- JOIN PREVIEW (публичные каналы/группы, найденные через поиск) ----
let joinPreviewItem = null;
let joinPreviewType = null;

function openJoinPreview(item, type) {
  joinPreviewItem = item;
  joinPreviewType = type;

  renderAvatarInto($("joinPreviewAvatar"), item.name, item.avatar);
  $("joinPreviewName").textContent = item.name;
  $("joinPreviewHandle").textContent = item.handle ? `@${item.handle}` : "";
  $("joinPreviewHandle").style.display = item.handle ? "block" : "none";

  const kindLabel = type === "channel" ? "канал" : "группа";
  const memberWord = pluralizeMembers(item.member_count);
  $("joinPreviewMeta").textContent = `${item.is_public ? "Публичный" : "Приватный"} ${kindLabel} · ${item.member_count} ${memberWord}`;

  $("joinPreviewDesc").textContent = item.description || "";
  $("joinPreviewDesc").style.display = item.description ? "block" : "none";

  const noteEl = $("joinPreviewNote");
  noteEl.innerHTML = "";
  const noteIcon = document.createElement("span");
  const noteText = document.createElement("span");
  if (type === "channel") {
    noteIcon.innerHTML = ICONS.info;
    noteText.textContent = "Писать в канал могут только владелец и администраторы";
  } else {
    noteIcon.innerHTML = ICONS.info;
    noteText.textContent = "Писать в группу может любой участник";
  }
  noteEl.appendChild(noteIcon); noteEl.appendChild(noteText);

  $("joinPreviewTitle").textContent = kindLabel === "канал" ? "Канал" : "Группа";
  $("joinPreviewBtn").textContent = "Присоединиться";
  $("joinPreviewBtn").className = "";

  $("usersPanel").classList.add("hidden");
  $("joinPreviewScreen").classList.add("active");
}

function closeJoinPreview() {
  $("joinPreviewScreen").classList.remove("active");
  $("usersPanel").classList.remove("hidden");
  joinPreviewItem = null; joinPreviewType = null;
}

function pluralizeMembers(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "участник";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "участника";
  return "участников";
}

async function confirmJoinPreview() {
  if (!joinPreviewItem || !joinPreviewType) return;
  const btn = $("joinPreviewBtn");
  btn.disabled = true; btn.textContent = "Открытие...";
  const item = joinPreviewItem; const type = joinPreviewType;
  $("joinPreviewScreen").classList.remove("active");
  joinPreviewItem = null; joinPreviewType = null;
  btn.disabled = false; btn.textContent = "Присоединиться";
  if (type === "channel") await openChannelChat(item);
  else await openGroupChat(item);
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
  const key = `user:${username}`;
  try {
    const res = await fetch(`${API_BASE}/messages/${encodeURIComponent(username)}?limit=${MESSAGES_PAGE_SIZE}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { return; } // обработано внутри fetch-обёртки (рефреш или logout)
    const data = await res.json();
    const history = data.messages || [];
    messageCache[key] = history.map(m => ({
      id: m.id, content: m.content, timestamp: m.timestamp,
      mine: myUserId !== null && m.sender_id === myUserId, delivered: m.delivered,
      message_type: m.message_type, media_data: m.media_data, duration: m.duration,
    }));
    chatPagination[key] = { hasMore: !!data.has_more, oldestId: history.length ? history[0].id : null, loading: false };
    renderMessages(key);
  } catch { $("messages").innerHTML = `<div style="text-align:center;color:#f44336;padding:20px;">Ошибка загрузки</div>`; }
}

async function loadChannelHistory(id) {
  $("messages").innerHTML = `<div style="text-align:center;color:#666;font-size:13px;padding:20px;">Загрузка...</div>`;
  const key = `channel:${id}`;
  try {
    const res = await fetch(`${API_BASE}/channels/${id}/messages?limit=${MESSAGES_PAGE_SIZE}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { $("messages").innerHTML = `<div style="text-align:center;color:#f44336;padding:20px;">Нет доступа</div>`; return; }
    const data = await res.json();
    const history = data.messages || [];
    messageCache[key] = history.map(m => ({
      id: m.id, content: m.content, timestamp: m.timestamp, mine: m.sender_username === myUsername, senderName: m.sender_username,
      message_type: m.message_type, media_data: m.media_data, duration: m.duration,
    }));
    chatPagination[key] = { hasMore: !!data.has_more, oldestId: history.length ? history[0].id : null, loading: false };
    renderMessages(key);
  } catch { $("messages").innerHTML = `<div style="text-align:center;color:#f44336;padding:20px;">Ошибка</div>`; }
}

async function loadGroupHistory(id) {
  $("messages").innerHTML = `<div style="text-align:center;color:#666;font-size:13px;padding:20px;">Загрузка...</div>`;
  const key = `group:${id}`;
  try {
    const res = await fetch(`${API_BASE}/groups/${id}/messages?limit=${MESSAGES_PAGE_SIZE}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { $("messages").innerHTML = `<div style="text-align:center;color:#f44336;padding:20px;">Нет доступа</div>`; return; }
    const data = await res.json();
    const history = data.messages || [];
    messageCache[key] = history.map(m => ({
      id: m.id, content: m.content, timestamp: m.timestamp, mine: m.sender_username === myUsername, senderName: m.sender_username,
      message_type: m.message_type, media_data: m.media_data, duration: m.duration,
    }));
    chatPagination[key] = { hasMore: !!data.has_more, oldestId: history.length ? history[0].id : null, loading: false };
    renderMessages(key);
  } catch { $("messages").innerHTML = `<div style="text-align:center;color:#f44336;padding:20px;">Ошибка</div>`; }
}

function renderMessages(cacheKey) {
  const container = $("messages");
  container.innerHTML = "";
  (messageCache[cacheKey] || []).forEach(m => addMessageBubble(m));
  container.scrollTop = container.scrollHeight;
}

function currentCacheKey() {
  if (currentChatType === "user" && currentChatWith) return `user:${currentChatWith}`;
  if (currentChatType === "channel" && currentChatId) return `channel:${currentChatId}`;
  if (currentChatType === "group" && currentChatId) return `group:${currentChatId}`;
  return null;
}

async function fetchOlderPage(cacheKey, beforeId) {
  const limit = MESSAGES_PAGE_SIZE;
  if (cacheKey.startsWith("user:")) {
    const username = cacheKey.slice(5);
    const res = await fetch(`${API_BASE}/messages/${encodeURIComponent(username)}?before_id=${beforeId}&limit=${limit}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return { has_more: !!data.has_more, messages: (data.messages || []).map(m => ({
      id: m.id, content: m.content, timestamp: m.timestamp,
      mine: myUserId !== null && m.sender_id === myUserId, delivered: m.delivered,
      message_type: m.message_type, media_data: m.media_data, duration: m.duration,
    })) };
  }
  const [kind, id] = [cacheKey.split(":")[0], cacheKey.split(":")[1]];
  const urlBase = kind === "channel" ? `${API_BASE}/channels/${id}/messages` : `${API_BASE}/groups/${id}/messages`;
  const res = await fetch(`${urlBase}?before_id=${beforeId}&limit=${limit}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return { has_more: !!data.has_more, messages: (data.messages || []).map(m => ({
    id: m.id, content: m.content, timestamp: m.timestamp, mine: m.sender_username === myUsername, senderName: m.sender_username,
    message_type: m.message_type, media_data: m.media_data, duration: m.duration,
  })) };
}

async function loadOlderMessagesIfNeeded() {
  const key = currentCacheKey();
  if (!key) return;
  const state = chatPagination[key];
  if (!state || state.loading || !state.hasMore || state.oldestId == null) return;

  const container = $("messages");
  if (container.scrollTop > 80) return; // подгружаем только когда реально близко к верху

  state.loading = true;
  let spinner = document.createElement("div");
  spinner.id = "olderMsgsSpinner";
  spinner.style.cssText = "text-align:center;color:#6b6f7a;font-size:12px;padding:8px;";
  spinner.textContent = "Загрузка...";
  container.insertBefore(spinner, container.firstChild);

  const prevScrollHeight = container.scrollHeight;
  const prevScrollTop = container.scrollTop;

  try {
    const page = await fetchOlderPage(key, state.oldestId);
    spinner.remove();
    if (page && page.messages.length > 0) {
      messageCache[key] = [...page.messages, ...(messageCache[key] || [])];
      state.oldestId = page.messages[0].id;
      state.hasMore = page.has_more;

      const fragment = document.createDocumentFragment();
      page.messages.forEach(m => fragment.appendChild(buildMessageBubbleEl(m)));
      container.insertBefore(fragment, container.firstChild);

      // компенсируем прыжок скролла из-за вставленного контента сверху
      container.scrollTop = prevScrollTop + (container.scrollHeight - prevScrollHeight);
    } else if (page) {
      state.hasMore = page.has_more;
    }
  } catch {
    spinner.remove();
  } finally {
    state.loading = false;
  }
}

function formatDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function openImageViewer(src) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:999;display:flex;align-items:center;justify-content:center;padding:24px;";
  const img = document.createElement("img");
  img.src = src;
  img.style.cssText = "max-width:100%;max-height:100%;border-radius:8px;object-fit:contain;";
  overlay.appendChild(img);
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

function setupVoiceBubble(div, src, totalDuration) {
  const audio = new Audio(src);
  const playBtn = div.querySelector(".voicePlayBtn");
  const progress = div.querySelector(".voiceProgress");
  const timeLabel = div.querySelector(".voiceTimeLabel");
  let playing = false;

  playBtn.onclick = () => {
    if (playing) { audio.pause(); return; }
    document.querySelectorAll("audio.tundukVoice").forEach(a => { if (a !== audio) a.pause(); });
    audio.play().catch(() => {});
  };
  audio.className = "tundukVoice";
  audio.addEventListener("play", () => { playing = true; playBtn.innerHTML = ICONS.pause; });
  audio.addEventListener("pause", () => { playing = false; playBtn.innerHTML = ICONS.play; });
  audio.addEventListener("ended", () => {
    playing = false; playBtn.innerHTML = ICONS.play;
    progress.style.width = "0%"; timeLabel.textContent = formatDuration(totalDuration);
  });
  audio.addEventListener("timeupdate", () => {
    const dur = audio.duration && isFinite(audio.duration) ? audio.duration : totalDuration;
    if (dur > 0) progress.style.width = `${Math.min(100, (audio.currentTime / dur) * 100)}%`;
    timeLabel.textContent = formatDuration(Math.max(0, dur - audio.currentTime));
  });
  div.querySelector(".voiceTrack").onclick = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const dur = audio.duration && isFinite(audio.duration) ? audio.duration : totalDuration;
    audio.currentTime = ratio * dur;
  };
}

function buildMessageBubbleEl(m) {
  const div = document.createElement("div");
  const mine = m.mine;
  const type = m.message_type || "text";
  const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  let tick = "";
  if (mine && currentChatType === "user") tick = m.delivered ? `<span class="tick delivered">${ICONS.tickTwo}</span>` : `<span class="tick">${ICONS.tickOne}</span>`;
  let nameHtml = "";
  if (!mine && m.senderName && currentChatType !== "user") nameHtml = `<div class="senderName">${escapeHtml(m.senderName)}</div>`;

  if (type === "image") {
    const hasCaption = !!(m.content && m.content.trim());
    div.className = "msg image " + (mine ? "mine" : "theirs") + (hasCaption ? "" : " noCaption");
    div.innerHTML = `${nameHtml}<img src="${escapeAttr(m.media_data)}" alt="">${hasCaption ? `<div class="caption">${escapeHtml(m.content)}</div>` : ""}<div class="meta">${time}${tick}</div>`;
    div.querySelector("img").onclick = () => openImageViewer(m.media_data);
  } else if (type === "voice") {
    div.className = "msg voice " + (mine ? "mine" : "theirs");
    const durLabel = formatDuration(m.duration || 0);
    div.innerHTML = `${nameHtml}<button class="voicePlayBtn" type="button">${ICONS.play}</button><div class="voiceBody"><div class="voiceTrack"><div class="voiceProgress"></div></div><div class="voiceMeta"><span class="voiceTimeLabel">${durLabel}</span><span>${time}${tick}</span></div></div>`;
    setupVoiceBubble(div, m.media_data, m.duration || 0);
  } else if (type === "sticker") {
    div.className = "msg sticker " + (mine ? "mine" : "theirs");
    div.innerHTML = `${nameHtml}<img src="${escapeAttr(m.media_data)}" alt=""><div class="meta">${time}${tick}</div>`;
    div.querySelector("img").onclick = () => openStickerAddChooser(m.media_data);
  } else {
    div.className = "msg " + (mine ? "mine" : "theirs");
    div.innerHTML = `${nameHtml}${escapeHtml(m.content)}<div class="meta">${time}${tick}</div>`;
  }
  return div;
}

function addMessageBubble(m) {
  const container = $("messages");
  container.appendChild(buildMessageBubbleEl(m));
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str; return d.innerHTML; }

// Сервер проверяет только префикс media_data/avatar ("data:image/..."), не всю строку —
// специально собранное значение с кавычкой внутри может вырваться из src="..." и вставить
// произвольный HTML/JS (хранимый XSS через чужой стикер/аватар/картинку в сообщении).
// Легитимный data URL кавычек не содержит, так что экранирование ничего не ломает.
function escapeAttr(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---- SEND ----
async function sendChatPayload(payload) {
  // payload: { content, message_type, media_data?, duration? }
  if (currentChatType === "user") {
    if (!ws || ws.readyState !== WebSocket.OPEN) { alert("Нет соединения"); return false; }
    ws.send(JSON.stringify({ receiver: currentChatWith, ...payload }));
    return true;
  }
  if (currentChatType === "channel") {
    if (!currentChatIsAdmin) return false;
    try {
      const res = await fetch(`${API_BASE}/channels/${currentChatId}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      const msg = await res.json();
      if (!res.ok) { alert(msg.detail || "Ошибка отправки"); return false; }
      const key = `channel:${currentChatId}`;
      if (!messageCache[key]) messageCache[key] = [];
      const entry = { id: msg.id, content: msg.content, timestamp: msg.timestamp, mine: true, senderName: myUsername, message_type: msg.message_type, media_data: msg.media_data, duration: msg.duration };
      messageCache[key].push(entry);
      addMessageBubble(entry);
      return true;
    } catch { alert("Сервер не отвечает"); return false; }
  }
  if (currentChatType === "group") {
    try {
      const res = await fetch(`${API_BASE}/groups/${currentChatId}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      const msg = await res.json();
      if (!res.ok) { alert(msg.detail || "Ошибка отправки"); return false; }
      const key = `group:${currentChatId}`;
      if (!messageCache[key]) messageCache[key] = [];
      const entry = { id: msg.id, content: msg.content, timestamp: msg.timestamp, mine: true, senderName: myUsername, message_type: msg.message_type, media_data: msg.media_data, duration: msg.duration };
      messageCache[key].push(entry);
      addMessageBubble(entry);
      return true;
    } catch { alert("Сервер не отвечает"); return false; }
  }
  return false;
}

async function sendMessage() {
  const input = $("msgInput"); const content = input.value.trim(); if (!content) return;
  const ok = await sendChatPayload({ content, message_type: "text" });
  if (ok !== false) { input.value = ""; updateSendControls(); }
}

function pickChatImage() { $("chatImageInput").click(); }

function onChatImageChosen(e) {
  const file = e.target.files[0]; if (!file) return;
  e.target.value = "";
  resizeChatImage(file, dataUrl => sendChatPayload({ content: "", message_type: "image", media_data: dataUrl }));
}

function resizeChatImage(file, callback, maxSize = 1200) {
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
      callback(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ---- VOICE RECORDING ----
let mediaRecorder = null;
let recordingStream = null;
let recordedChunks = [];
let recordingStartTime = null;
let recordingTimerInterval = null;

function updateSendControls() {
  const hasText = $("msgInput").value.trim().length > 0;
  $("micBtn").classList.toggle("hidden", hasText);
  $("sendBtn").classList.toggle("hidden", !hasText);
}

function resetInputBar() {
  if (mediaRecorder) stopVoiceRecording(false);
  $("msgInput").value = "";
  updateSendControls();
}

async function startVoiceRecording() {
  if (currentChatType === "channel" && !currentChatIsAdmin) return;
  if (mediaRecorder) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert("Микрофон не поддерживается этим браузером"); return; }
  try {
    recordingStream = await navigator.mediaDevices.getUserMedia(CALL_AUDIO_CONSTRAINTS);
  } catch {
    alert("Нет доступа к микрофону");
    return;
  }
  recordedChunks = [];
  let mimeType = "audio/webm;codecs=opus";
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "audio/webm";
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "";
  try {
    mediaRecorder = mimeType ? new MediaRecorder(recordingStream, { mimeType }) : new MediaRecorder(recordingStream);
  } catch {
    alert("Запись голосовых не поддерживается этим браузером");
    recordingStream.getTracks().forEach(t => t.stop());
    recordingStream = null;
    return;
  }
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.start();
  recordingStartTime = Date.now();
  $("inputBar").classList.add("hidden");
  $("recordingBar").classList.remove("hidden");
  $("recordingTimer").textContent = "0:00";
  recordingTimerInterval = setInterval(() => {
    $("recordingTimer").textContent = formatDuration((Date.now() - recordingStartTime) / 1000);
  }, 250);
}

function stopVoiceRecording(shouldSend) {
  if (!mediaRecorder) return;
  clearInterval(recordingTimerInterval);
  const durationSeconds = Math.round((Date.now() - recordingStartTime) / 1000);
  const recorder = mediaRecorder;
  const streamToStop = recordingStream;
  const wantSend = shouldSend && durationSeconds >= 1;
  mediaRecorder = null;

  recorder.onstop = () => {
    streamToStop.getTracks().forEach(t => t.stop());
    $("recordingBar").classList.add("hidden");
    $("inputBar").classList.remove("hidden");
    updateSendControls();
    if (!wantSend) { recordedChunks = []; return; }
    const blob = new Blob(recordedChunks, { type: recorder.mimeType || "audio/webm" });
    recordedChunks = [];
    const reader = new FileReader();
    reader.onload = () => { sendChatPayload({ content: "", message_type: "voice", media_data: reader.result, duration: durationSeconds }); };
    reader.readAsDataURL(blob);
  };
  recorder.stop();
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
  ws.onopen  = () => {
    setStatus("онлайн", true);
    // Пока сокет был разорван (моргнула сеть, экран заблокировался и т.п.), сервер не
    // досылает пропущенное само — досинхронизируемся вручную через REST.
    syncContactsFromServer();
    if (currentChatType === "user" && currentChatWith) loadUserHistory(currentChatWith);
    else if (currentChatType === "channel" && currentChatId) loadChannelHistory(currentChatId);
    else if (currentChatType === "group" && currentChatId) loadGroupHistory(currentChatId);
  };
  ws.onclose = () => { setStatus("отключено, переподключение...", false); if (token) setTimeout(connectWebSocket, 3000); };
  ws.onerror = () => setStatus("ошибка соединения", false);
  ws.onmessage = event => {
    let data; try { data = JSON.parse(event.data); } catch { return; }
    if (data.type === "error") { alert("Ошибка: " + data.detail); return; }
    if (data.type === "message") {
      const other = data.sender; const key = `user:${other}`;
      if (!messageCache[key]) messageCache[key] = [];
      const entry = { id: data.id, content: data.content, mine: false, timestamp: data.timestamp, message_type: data.message_type, media_data: data.media_data, duration: data.duration };
      messageCache[key].push(entry);

      const wasNewChat = !getRecentChats().includes(key);
      addRecentChat(other, "user"); // сохраняем чат у получателя автоматически

      if (currentChatType === "user" && currentChatWith === other) {
        addMessageBubble(entry);
      } else {
        // Чат не открыт прямо сейчас — показываем уведомление и обновляем список
        const preview = data.message_type === "image" ? "Фото" : data.message_type === "voice" ? "Голосовое сообщение" : data.message_type === "sticker" ? "Стикер" : data.content;
        showIncomingNotification(other, preview);
        renderRecentChats();
      }
      playIncomingSound();
    }
    if (data.type === "ack") {
      const other = data.receiver; const key = `user:${other}`;
      if (!messageCache[key]) messageCache[key] = [];
      const entry = { id: data.id, content: data.content, mine: true, timestamp: data.timestamp, delivered: data.delivered, message_type: data.message_type, media_data: data.media_data, duration: data.duration };
      messageCache[key].push(entry);
      if (currentChatType === "user" && currentChatWith === other) addMessageBubble(entry);
    }
    if (["call_offer", "call_answer", "call_ice", "call_end", "call_reject", "call_busy", "call_unavailable"].includes(data.type)) {
      handleCallSignal(data);
    }
  };
}

// ---- ЗВОНКИ (WebRTC, аудио 1:1) ----
// Один STUN не всегда пробивает NAT (особенно с VPN или мобильной сетью) — добавлен
// бесплатный TURN (Open Relay) как запасной путь для случаев, где прямое P2P невозможно.
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];
const CALL_AUDIO_CONSTRAINTS = {
  audio: {
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
  },
};

let callPeerConnection = null;
let localCallStream    = null;
let remoteCallAudioEl  = null;
let callState          = "idle"; // idle | calling | ringing | connecting | connected
let callWithUsername   = null;
let pendingOfferSdp    = null;
let callMuted          = false;
let callDeafened       = false;
let callTimerInterval  = null;
let callStartTime      = null;
let ringtoneInterval   = null;
let disconnectGraceTimer = null; // прощаем кратковременные обрывы сети вместо мгновенного завершения звонка

function formatCallDuration(totalSeconds) {
  totalSeconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

function createCallPeerConnection() {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.onicecandidate = e => {
    if (e.candidate && callWithUsername) {
      ws.send(JSON.stringify({ type: "call_ice", target: callWithUsername, candidate: e.candidate }));
    }
  };
  pc.ontrack = e => {
    if (!remoteCallAudioEl) { remoteCallAudioEl = new Audio(); remoteCallAudioEl.autoplay = true; }
    remoteCallAudioEl.muted = callDeafened;
    remoteCallAudioEl.srcObject = e.streams[0];
  };
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;

    if (state === "connected") {
      if (disconnectGraceTimer) { clearTimeout(disconnectGraceTimer); disconnectGraceTimer = null; }
      if (callState !== "connected") {
        callState = "connected";
        stopRingtone();
        startCallTimer();
        showCallUI(callWithUsername, "connected");
      } else {
        setCallStatusText("На связи");
      }
      return;
    }

    // "disconnected" почти всегда временная просадка (моргнул Wi-Fi, переключилась сеть
    // на LTE) и часто сама восстанавливается — раньше звонок из-за этого рвался мгновенно,
    // теперь даём немного времени на реконнект, прежде чем сдаться.
    if (state === "disconnected") {
      if (callState !== "idle" && !disconnectGraceTimer) {
        setCallStatusText("Восстановление соединения...");
        disconnectGraceTimer = setTimeout(() => {
          disconnectGraceTimer = null;
          if (pc.connectionState !== "connected" && callState !== "idle") endCallLocally();
        }, 8000);
      }
      return;
    }

    // failed/closed — соединение точно не восстановится
    if (["failed", "closed"].includes(state) && callState !== "idle") {
      if (disconnectGraceTimer) { clearTimeout(disconnectGraceTimer); disconnectGraceTimer = null; }
      endCallLocally();
    }
  };
  return pc;
}

function showCallUI(username, mode) {
  $("callScreen").classList.add("active");
  $("callScreen").classList.toggle("ringing", mode === "ringing");
  renderAvatarInto($("callAvatar"), username, (userProfileCache[username] || {}).avatar || "");
  $("callUserName").textContent = username;
  $("callTimer").classList.add("hidden");
  $("callIncomingActions").classList.add("hidden");
  $("callActiveActions").classList.add("hidden");

  if (mode === "calling")    { $("callStatus").textContent = "Звонок..."; $("callActiveActions").classList.remove("hidden"); }
  if (mode === "ringing")    { $("callStatus").textContent = "Входящий звонок"; $("callIncomingActions").classList.remove("hidden"); }
  if (mode === "connecting") { $("callStatus").textContent = "Соединение..."; $("callActiveActions").classList.remove("hidden"); }
  if (mode === "connected")  { $("callStatus").textContent = "На связи"; $("callTimer").classList.remove("hidden"); $("callActiveActions").classList.remove("hidden"); }
}

function setCallStatusText(text) { $("callStatus").textContent = text; }

async function startCall(username) {
  if (callState !== "idle") { alert("Уже есть активный звонок"); return; }
  if (!ws || ws.readyState !== WebSocket.OPEN) { alert("Нет соединения"); return; }
  callWithUsername = username; callState = "calling";
  showCallUI(username, "calling");
  try {
    localCallStream = await navigator.mediaDevices.getUserMedia(CALL_AUDIO_CONSTRAINTS);
  } catch {
    alert("Нет доступа к микрофону");
    resetCallState();
    return;
  }
  callPeerConnection = createCallPeerConnection();
  localCallStream.getTracks().forEach(t => callPeerConnection.addTrack(t, localCallStream));
  const offer = await callPeerConnection.createOffer();
  await callPeerConnection.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "call_offer", target: username, sdp: offer }));
}

async function acceptCall() {
  stopRingtone();
  try {
    localCallStream = await navigator.mediaDevices.getUserMedia(CALL_AUDIO_CONSTRAINTS);
  } catch {
    alert("Нет доступа к микрофону");
    declineCall();
    return;
  }
  callState = "connecting";
  showCallUI(callWithUsername, "connecting");
  callPeerConnection = createCallPeerConnection();
  localCallStream.getTracks().forEach(t => callPeerConnection.addTrack(t, localCallStream));
  await callPeerConnection.setRemoteDescription(new RTCSessionDescription(pendingOfferSdp));
  const answer = await callPeerConnection.createAnswer();
  await callPeerConnection.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: "call_answer", target: callWithUsername, sdp: answer }));
}

function declineCall() {
  if (callWithUsername) ws.send(JSON.stringify({ type: "call_reject", target: callWithUsername }));
  resetCallState();
}

function hangupCall() {
  if (callWithUsername) ws.send(JSON.stringify({ type: "call_end", target: callWithUsername }));
  resetCallState();
}

function endCallLocally() {
  setCallStatusText("Звонок завершён");
  stopRingtone();
  setTimeout(resetCallState, 900);
}

function resetCallState() {
  stopRingtone();
  clearInterval(callTimerInterval);
  if (disconnectGraceTimer) { clearTimeout(disconnectGraceTimer); disconnectGraceTimer = null; }
  if (callPeerConnection) { try { callPeerConnection.close(); } catch {} callPeerConnection = null; }
  if (localCallStream) { localCallStream.getTracks().forEach(t => t.stop()); localCallStream = null; }
  if (remoteCallAudioEl) { remoteCallAudioEl.srcObject = null; }
  callState = "idle"; callWithUsername = null; pendingOfferSdp = null; callMuted = false; callDeafened = false;
  $("callMuteBtn").classList.remove("active"); $("callMuteBtn").innerHTML = ICONS.mic;
  $("callDeafenBtn").classList.remove("active"); $("callDeafenBtn").innerHTML = ICONS.headphones;
  $("callScreen").classList.remove("active", "ringing");
}

function startCallTimer() {
  callStartTime = Date.now();
  $("callTimer").textContent = "0:00";
  callTimerInterval = setInterval(() => {
    $("callTimer").textContent = formatCallDuration((Date.now() - callStartTime) / 1000);
  }, 1000);
}

function toggleCallMute() {
  if (!localCallStream) return;
  callMuted = !callMuted;
  localCallStream.getAudioTracks().forEach(t => { t.enabled = !callMuted; });
  $("callMuteBtn").classList.toggle("active", callMuted);
  $("callMuteBtn").innerHTML = callMuted ? ICONS.micOff : ICONS.mic;
}

function toggleCallDeafen() {
  callDeafened = !callDeafened;
  if (remoteCallAudioEl) remoteCallAudioEl.muted = callDeafened;
  $("callDeafenBtn").classList.toggle("active", callDeafened);
  $("callDeafenBtn").innerHTML = callDeafened ? ICONS.headphonesOff : ICONS.headphones;
}

function playCallBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.value = 660; osc.type = "sine";
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.start(); osc.stop(audioCtx.currentTime + 0.4);
  } catch {}
}

function startRingtone() {
  stopRingtone();
  playCallBeep();
  ringtoneInterval = setInterval(playCallBeep, 1600);
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200]);
}

function stopRingtone() {
  clearInterval(ringtoneInterval); ringtoneInterval = null;
  if (navigator.vibrate) navigator.vibrate(0);
}

async function handleCallSignal(data) {
  if (data.type === "call_offer") {
    if (callState !== "idle") { ws.send(JSON.stringify({ type: "call_reject", target: data.from })); return; }
    callWithUsername = data.from; callState = "ringing"; pendingOfferSdp = data.sdp;
    showCallUI(data.from, "ringing");
    startRingtone();
    return;
  }
  if (data.type === "call_answer") {
    if (callPeerConnection) await callPeerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    return;
  }
  if (data.type === "call_ice") {
    if (callPeerConnection && data.candidate) {
      try { await callPeerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch {}
    }
    return;
  }
  if (data.type === "call_reject") { setCallStatusText("Звонок отклонён"); stopRingtone(); setTimeout(resetCallState, 1200); return; }
  if (data.type === "call_busy") { setCallStatusText("Собеседник занят"); stopRingtone(); setTimeout(resetCallState, 1200); return; }
  if (data.type === "call_unavailable") { setCallStatusText("Пользователь не в сети"); stopRingtone(); setTimeout(resetCallState, 1200); return; }
  if (data.type === "call_end") { endCallLocally(); return; }
}

// ---- SETTINGS ----
// TODO: сюда же в будущем повесить переключатель тёмная/светлая тема (см. сводку проекта) —
// цвета сейчас захардкожены в style.css, для теми их сперва нужно вынести в CSS-переменные.
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

// ---- СТИКЕРЫ: API ----
let myStickerPacksCache = null;

async function fetchMyStickerPacks(force = false) {
  if (myStickerPacksCache && !force) return myStickerPacksCache;
  try {
    const res = await fetch(`${API_BASE}/stickers/packs`, { headers: { Authorization: `Bearer ${token}` } });
    myStickerPacksCache = res.ok ? await res.json() : [];
  } catch { myStickerPacksCache = []; }
  return myStickerPacksCache;
}

async function fetchStickerPack(packId) {
  const packs = await fetchMyStickerPacks(true);
  return packs.find(p => p.id === packId) || null;
}

// ---- СТИКЕРЫ: экран "Стикерпаки" (список) ----
function openStickersScreen() {
  $("createPackForm").classList.add("hidden");
  $("newPackNameInput").value = "";
  $("stickersScreen").classList.add("active");
  renderStickerPacksList();
}
function closeStickersScreen() { $("stickersScreen").classList.remove("active"); }

function toggleCreatePackForm() {
  $("createPackForm").classList.toggle("hidden");
  if (!$("createPackForm").classList.contains("hidden")) $("newPackNameInput").focus();
}

async function renderStickerPacksList() {
  const listEl = $("stickerPacksList");
  listEl.innerHTML = `<div style="text-align:center;color:#6b6f7a;padding:20px;font-size:13px;">Загрузка...</div>`;
  const packs = await fetchMyStickerPacks(true);
  listEl.innerHTML = "";
  if (packs.length === 0) {
    listEl.innerHTML = `<div style="text-align:center;color:#6b6f7a;padding:30px 24px;font-size:13px;line-height:1.5;">У тебя пока нет стикерпаков. Нажми «+» вверху, чтобы создать первый.</div>`;
    return;
  }
  packs.forEach(pack => listEl.appendChild(buildPackRow(pack)));
}

function buildPackRow(pack) {
  const row = document.createElement("div");
  row.className = "packRow";
  const icon = document.createElement("div"); icon.className = "packRowIcon";
  if (pack.stickers && pack.stickers[0]) icon.innerHTML = `<img src="${escapeAttr(pack.stickers[0].image_data)}" alt="">`;
  else icon.innerHTML = ICONS.sticker;
  const info = document.createElement("div"); info.className = "packRowInfo";
  const name = document.createElement("span"); name.textContent = pack.name;
  const count = document.createElement("span"); count.className = "packRowCount"; count.textContent = `${pack.sticker_count}/10`;
  info.appendChild(name); info.appendChild(count);
  const delBtn = document.createElement("button"); delBtn.className = "packRowDelete"; delBtn.innerHTML = ICONS.trash;
  delBtn.onclick = e => { e.stopPropagation(); deleteStickerPackConfirm(pack); };
  row.appendChild(icon); row.appendChild(info); row.appendChild(delBtn);
  row.onclick = () => openStickerPackScreen(pack.id);
  return row;
}

async function createStickerPack() {
  const name = $("newPackNameInput").value.trim();
  if (!name) return;
  try {
    const res = await fetch(`${API_BASE}/stickers/packs`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name }) });
    const data = await res.json();
    if (!res.ok) { alert(data.detail || "Ошибка"); return; }
    $("createPackForm").classList.add("hidden");
    $("newPackNameInput").value = "";
    await renderStickerPacksList();
  } catch { alert("Сервер не отвечает"); }
}

function deleteStickerPackConfirm(pack) {
  if (!confirm(`Удалить стикерпак «${pack.name}» вместе со всеми стикерами?`)) return;
  deleteStickerPack(pack.id);
}

async function deleteStickerPack(packId) {
  try {
    await fetch(`${API_BASE}/stickers/packs/${packId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    await renderStickerPacksList();
  } catch { alert("Сервер не отвечает"); }
}

// ---- СТИКЕРЫ: экран одного пака ----
let currentStickerPackId = null;

async function openStickerPackScreen(packId) {
  currentStickerPackId = packId;
  $("stickerPackScreen").classList.add("active");
  await renderStickerPackScreen();
}
function closeStickerPackScreen() { $("stickerPackScreen").classList.remove("active"); currentStickerPackId = null; }

async function renderStickerPackScreen() {
  const pack = await fetchStickerPack(currentStickerPackId);
  if (!pack) { closeStickerPackScreen(); return; }
  $("stickerPackTitle").textContent = pack.name;
  $("stickerPackCount").textContent = `${pack.sticker_count}/10 стикеров`;
  const grid = $("stickerGrid");
  grid.innerHTML = "";
  pack.stickers.forEach(st => {
    const tile = document.createElement("div"); tile.className = "stickerTile";
    tile.innerHTML = `<img src="${escapeAttr(st.image_data)}" alt="">`;
    const delBtn = document.createElement("button"); delBtn.className = "stickerTileDelete"; delBtn.innerHTML = ICONS.close;
    delBtn.onclick = () => deleteStickerFromPack(st.id);
    tile.appendChild(delBtn);
    grid.appendChild(tile);
  });
  const addTile = document.createElement("button");
  addTile.className = "stickerTile stickerAddTile" + (pack.sticker_count >= 10 ? " disabled" : "");
  addTile.innerHTML = ICONS.plus;
  addTile.onclick = pickStickerImageFile;
  grid.appendChild(addTile);
}

function pickStickerImageFile() { $("stickerFileInput").click(); }

function onStickerFileChosen(e) {
  const file = e.target.files[0]; if (!file) return;
  e.target.value = "";
  resizeStickerImage(file, dataUrl => uploadSticker(dataUrl));
}

function resizeStickerImage(file, callback, maxSize = 512) {
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
      callback(canvas.toDataURL("image/png")); // PNG сохраняет прозрачность
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function uploadSticker(dataUrl) {
  try {
    const res = await fetch(`${API_BASE}/stickers/packs/${currentStickerPackId}/stickers`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ image_data: dataUrl }) });
    const data = await res.json();
    if (!res.ok) { alert(data.detail || "Ошибка"); return; }
    myStickerPacksCache = null;
    await renderStickerPackScreen();
  } catch { alert("Сервер не отвечает"); }
}

async function deleteStickerFromPack(stickerId) {
  try {
    await fetch(`${API_BASE}/stickers/${stickerId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    myStickerPacksCache = null;
    await renderStickerPackScreen();
  } catch { alert("Сервер не отвечает"); }
}

// ---- СТИКЕРЫ: отправка в чат ----
async function openStickerPicker() {
  $("stickerPickerScreen").classList.add("active");
  const body = $("stickerPickerBody");
  body.innerHTML = `<div style="text-align:center;color:#6b6f7a;padding:20px;font-size:13px;">Загрузка...</div>`;
  const packs = await fetchMyStickerPacks(true);
  body.innerHTML = "";
  const packsWithStickers = packs.filter(p => p.stickers && p.stickers.length > 0);
  if (packsWithStickers.length === 0) {
    body.innerHTML = `<div class="stickerPickerEmpty">У тебя ещё нет стикеров.<br>Зайди в Настройки → Стикеры, чтобы создать пак и добавить картинки из галереи.</div>`;
    return;
  }
  packsWithStickers.forEach(pack => {
    const label = document.createElement("div"); label.className = "stickerPickerGroupLabel"; label.textContent = pack.name;
    const grid = document.createElement("div"); grid.className = "stickerPickerGrid";
    pack.stickers.forEach(st => {
      const btn = document.createElement("button"); btn.className = "stickerPickerItem";
      btn.innerHTML = `<img src="${escapeAttr(st.image_data)}" alt="">`;
      btn.onclick = () => sendStickerMessage(st.image_data);
      grid.appendChild(btn);
    });
    body.appendChild(label); body.appendChild(grid);
  });
}
function closeStickerPicker() { $("stickerPickerScreen").classList.remove("active"); }

async function sendStickerMessage(imageData) {
  closeStickerPicker();
  await sendChatPayload({ content: "", message_type: "sticker", media_data: imageData });
}

// ---- СТИКЕРЫ: сохранить чужой стикер к себе ----
async function openStickerAddChooser(imageData) {
  const packs = await fetchMyStickerPacks(true);
  const overlay = document.createElement("div");
  overlay.className = "stickerAddSheet";
  const sheet = document.createElement("div"); sheet.className = "stickerAddSheetBody";

  const title = document.createElement("div"); title.className = "stickerAddSheetTitle";
  title.textContent = "Добавить в свои стикеры";
  sheet.appendChild(title);

  if (packs.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "text-align:center;color:#6b6f7a;font-size:13px;padding:10px 4px 4px;line-height:1.5;";
    empty.textContent = "Сначала создай стикерпак в Настройках → Стикеры.";
    sheet.appendChild(empty);
  } else {
    packs.forEach(pack => {
      const row = document.createElement("div");
      const full = pack.sticker_count >= 10;
      row.className = "stickerAddSheetRow" + (full ? " disabled" : "");
      row.innerHTML = `<span>${escapeHtml(pack.name)}</span><span>${pack.sticker_count}/10</span>`;
      row.onclick = async () => {
        if (full) return;
        overlay.remove();
        try {
          const res = await fetch(`${API_BASE}/stickers/packs/${pack.id}/stickers`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ image_data: imageData }) });
          if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.detail || "Ошибка"); return; }
          myStickerPacksCache = null;
        } catch { alert("Сервер не отвечает"); }
      };
      sheet.appendChild(row);
    });
  }

  const cancelBtn = document.createElement("button"); cancelBtn.className = "stickerAddSheetCancel"; cancelBtn.textContent = "Отмена";
  cancelBtn.onclick = () => overlay.remove();
  sheet.appendChild(cancelBtn);

  overlay.appendChild(sheet);
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
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
if (typeof emailjs !== "undefined") {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

injectIcons();
applyWallpaper();
requestNotifyPermission();

$("showLoginBtn").onclick    = showLoginForm;
$("showRegisterBtn").onclick = showRegisterForm;
$("loginBackBtn").onclick    = showAuthChoice;
$("loginSubmitBtn").onclick  = loginSubmit;
$("registerBackBtn").onclick = showAuthChoice;
$("registerSubmitBtn").onclick = registerStart;
$("alreadyGotCodeBtn").onclick = () => {
  const email = $("regEmail").value.trim();
  if (!email) { $("registerError").textContent = "Сначала укажи почту"; return; }
  pendingRegistrationEmail = email;
  showVerifyForm(email);
};
$("regUsername").addEventListener("input", onRegUsernameInput);
restrictToLatinHandle($("regUsername"));
restrictToLatinHandle($("profileUsernameInput"));
restrictToLatinHandle($("channelHandleInput"));
restrictToLatinHandle($("groupHandleInput"));
$("verifyBackBtn").onclick   = showRegisterForm;
$("verifySubmitBtn").onclick = registerVerify;
$("verifyCode").addEventListener("keypress", e => { if (e.key === "Enter") registerVerify(); });
$("logoutBtn").onclick   = logout;
$("backBtn").onclick     = closeChat;
$("sendBtn").onclick     = sendMessage;
$("msgInput").addEventListener("keypress", e => { if (e.key === "Enter") sendMessage(); });
$("msgInput").addEventListener("input", updateSendControls);
let _scrollLoadThrottle = null;
$("messages").addEventListener("scroll", () => {
  if (_scrollLoadThrottle) return;
  _scrollLoadThrottle = setTimeout(() => { _scrollLoadThrottle = null; }, 150);
  loadOlderMessagesIfNeeded();
});
$("attachBtn").onclick   = pickChatImage;
$("chatImageInput").addEventListener("change", onChatImageChosen);
$("micBtn").onclick            = startVoiceRecording;
$("cancelRecordingBtn").onclick = () => stopVoiceRecording(false);
$("sendRecordingBtn").onclick   = () => stopVoiceRecording(true);

$("callBtn").onclick        = () => { if (currentChatType === "user" && currentChatWith) startCall(currentChatWith); };
$("callAcceptBtn").onclick  = acceptCall;
$("callDeclineBtn").onclick = declineCall;
$("callHangupBtn").onclick  = hangupCall;
$("callMuteBtn").onclick    = toggleCallMute;
$("callDeafenBtn").onclick  = toggleCallDeafen;
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

$("stickerPacksRow").onclick    = openStickersScreen;
$("stickersBackBtn").onclick    = closeStickersScreen;
$("createPackBtn").onclick      = toggleCreatePackForm;
$("createPackConfirmBtn").onclick = createStickerPack;
$("newPackNameInput").addEventListener("keypress", e => { if (e.key === "Enter") createStickerPack(); });
$("stickerPackBackBtn").onclick = closeStickerPackScreen;
$("deletePackBtn").onclick      = async () => {
  const pack = await fetchStickerPack(currentStickerPackId);
  if (pack) { closeStickerPackScreen(); deleteStickerPackConfirm(pack); }
};
$("stickerFileInput").addEventListener("change", onStickerFileChosen);

$("stickerBtn").onclick            = openStickerPicker;
$("stickerPickerBackBtn").onclick  = closeStickerPicker;

if ($("membersBtn"))     $("membersBtn").onclick     = openMembers;
if ($("membersBackBtn")) $("membersBackBtn").onclick = closeMembers;

$("joinPreviewBackBtn").onclick = closeJoinPreview;
$("joinPreviewBtn").onclick     = confirmJoinPreview;

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
  resizeAndProcess(file, dataUrl => { channelAvatarData = dataUrl; $("channelAvatarPreview").innerHTML = `<img src="${escapeAttr(dataUrl)}" style="width:100%;height:100%;object-fit:cover;">`; $("channelAvatarPreview").style.background = "none"; });
});

$("groupTypePublic").onclick    = () => setGroupType(true);
$("groupTypePrivate").onclick   = () => setGroupType(false);
$("createGroupBackBtn").onclick = closeCreateGroup;
$("createGroupBtn").onclick     = createGroup;
$("groupAvatarEditBtn").onclick = () => $("groupAvatarInput").click();
$("groupAvatarInput").addEventListener("change", e => {
  const file = e.target.files[0]; if (!file) return;
  resizeAndProcess(file, dataUrl => { groupAvatarData = dataUrl; $("groupAvatarPreview").innerHTML = `<img src="${escapeAttr(dataUrl)}" style="width:100%;height:100%;object-fit:cover;">`; $("groupAvatarPreview").style.background = "none"; });
});

document.addEventListener("click", e => {
  if (fabOpen && !$("fab").contains(e.target) && !$("fabMenu").contains(e.target)) closeFab();
});

// ---- INIT ----
if (token && myUsername) { showApp(); } else { showAuth(); showAuthChoice(); }
