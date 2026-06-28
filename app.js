// ======= НАСТРОЙКИ =======
const API_BASE = "https://tunduk-messenger.onrender.com";
const WS_BASE = "wss://tunduk-messenger.onrender.com";
// ==========================

let token = localStorage.getItem("tunduk_token") || null;
let myUsername = localStorage.getItem("tunduk_username") || null;
let myUserId = null;
let myBio = "";
let myAvatar = "";
let ws = null;
let currentChatWith = null;
let allUsers = [];
// Кэш сообщений по собеседнику: { "alice": [ {content, mine, timestamp, delivered}, ... ] }
let messageCache = {};
// Кэш профилей пользователей: { "alice": {username, bio, avatar} }
let userProfileCache = {};

const $ = (id) => document.getElementById(id);

// ---------- SVG-ИКОНКИ ----------
// Простые inline SVG вместо эмодзи — чтобы одинаково выглядело на всех устройствах

const ICONS = {
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><polyline points="15 18 9 12 15 6"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  tickOne: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>`,
  tickTwo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="18 6 7 17 2 12"/><polyline points="22 6 11 17 9 15"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
};

function injectIcons() {
  $("refreshUsers").innerHTML = `${ICONS.refresh} Обновить список`;
  $("backBtn").innerHTML = ICONS.back;
  $("sendBtn").innerHTML = ICONS.send;
  $("logoutBtn").innerHTML = `${ICONS.logout} Выйти`;
  $("profileBackBtn").innerHTML = ICONS.back;
  $("avatarEditBtn").innerHTML = ICONS.camera;
}

function setStatus(text, online) {
  const el = $("status");
  el.textContent = text;
  el.className = online ? "online" : "offline";
}

function showAuth() {
  $("auth").style.display = "flex";
  $("app").style.display = "none";
}

function showApp() {
  $("auth").style.display = "none";
  $("app").style.display = "flex";
  $("meLabel").textContent = myUsername;
  loadMyId();
  loadUsers();
  connectWebSocket();
}

// ---------- АВАТАРЫ ----------

function renderAvatarInto(el, username, avatarDataUrl) {
  if (avatarDataUrl) {
    el.innerHTML = `<img src="${avatarDataUrl}" alt="">`;
  } else {
    const letter = (username || "?").trim().charAt(0).toUpperCase();
    el.innerHTML = "";
    el.textContent = letter;
    el.style.background = colorFromString(username || "?");
  }
}

function colorFromString(str) {
  // Стабильный цвет на основе имени — чтобы у каждого пользователя был свой устойчивый цвет аватара
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

function updateMyAvatarUI() {
  renderAvatarInto($("myAvatarSmall"), myUsername, myAvatar);
}

// ---------- AUTH ----------

async function register() {
  const username = $("username").value.trim();
  const password = $("password").value;
  $("authError").textContent = "";
  if (!username || !password) {
    $("authError").textContent = "Заполни имя и пароль";
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      $("authError").textContent = data.detail || "Ошибка регистрации";
      return;
    }
    // После успешной регистрации сразу логинимся
    await login();
  } catch (e) {
    $("authError").textContent = "Сервер не отвечает: " + e.message;
  }
}

async function login() {
  const username = $("username").value.trim();
  const password = $("password").value;
  $("authError").textContent = "";
  if (!username || !password) {
    $("authError").textContent = "Заполни имя и пароль";
    return;
  }
  try {
    const body = new URLSearchParams();
    body.append("username", username);
    body.append("password", password);
    body.append("grant_type", "password");

    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    const data = await res.json();
    if (!res.ok) {
      $("authError").textContent = data.detail || "Ошибка входа";
      return;
    }
    token = data.access_token;
    myUsername = username;
    localStorage.setItem("tunduk_token", token);
    localStorage.setItem("tunduk_username", myUsername);
    showApp();
  } catch (e) {
    $("authError").textContent = "Сервер не отвечает: " + e.message;
  }
}

function logout() {
  if (ws) { ws.close(); ws = null; }
  token = null;
  myUsername = null;
  myBio = "";
  myAvatar = "";
  localStorage.removeItem("tunduk_token");
  localStorage.removeItem("tunduk_username");
  messageCache = {};
  userProfileCache = {};
  $("username").value = "";
  $("password").value = "";
  setStatus("не подключено", false);
  showAuth();
}

// ---------- MY PROFILE ----------

async function loadMyId() {
  try {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) { logout(); return; }
    const me = await res.json();
    myUserId = me.id;
    myBio = me.bio || "";
    myAvatar = me.avatar || "";
    updateMyAvatarUI();
  } catch (e) {
    console.error("Не удалось получить свой ID", e);
  }
}

function openMyProfile() {
  $("profileUsernameInput").value = myUsername;
  $("profileBioInput").value = myBio;
  renderAvatarInto($("profileAvatarBig"), myUsername, myAvatar);
  $("profileMsg").textContent = "";
  $("profileScreen").classList.add("active");
  $("usersPanel").classList.add("hidden");
  $("chatPanel").classList.remove("active");
}

function closeProfile() {
  $("profileScreen").classList.remove("active");
  $("usersPanel").classList.remove("hidden");
}

async function saveProfile() {
  const newUsername = $("profileUsernameInput").value.trim();
  const newBio = $("profileBioInput").value.trim();
  $("profileMsg").style.color = "#4caf50";
  $("profileMsg").textContent = "Сохранение...";

  try {
    const res = await fetch(`${API_BASE}/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ username: newUsername, bio: newBio })
    });
    const data = await res.json();
    if (!res.ok) {
      $("profileMsg").style.color = "#f44336";
      $("profileMsg").textContent = data.detail || "Ошибка сохранения";
      return;
    }
    myUsername = data.username;
    myBio = data.bio || "";
    myAvatar = data.avatar || "";
    localStorage.setItem("tunduk_username", myUsername);
    $("meLabel").textContent = myUsername;
    updateMyAvatarUI();
    $("profileMsg").style.color = "#4caf50";
    $("profileMsg").textContent = "Сохранено";
  } catch (e) {
    $("profileMsg").style.color = "#f44336";
    $("profileMsg").textContent = "Сервер не отвечает";
  }
}

function pickAvatarFile() {
  $("avatarFileInput").click();
}

function onAvatarFileChosen(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    $("profileMsg").style.color = "#f44336";
    $("profileMsg").textContent = "Выбери файл изображения";
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Уменьшаем картинку, чтобы не отправлять на сервер огромные файлы
      const maxSize = 256;
      let { width, height } = img;
      if (width > height) {
        if (width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      uploadAvatar(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function uploadAvatar(dataUrl) {
  $("profileMsg").style.color = "#4caf50";
  $("profileMsg").textContent = "Загрузка фото...";
  try {
    const res = await fetch(`${API_BASE}/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ avatar: dataUrl })
    });
    const data = await res.json();
    if (!res.ok) {
      $("profileMsg").style.color = "#f44336";
      $("profileMsg").textContent = data.detail || "Не удалось загрузить фото";
      return;
    }
    myAvatar = data.avatar || "";
    renderAvatarInto($("profileAvatarBig"), myUsername, myAvatar);
    updateMyAvatarUI();
    $("profileMsg").style.color = "#4caf50";
    $("profileMsg").textContent = "Фото обновлено";
  } catch (e) {
    $("profileMsg").style.color = "#f44336";
    $("profileMsg").textContent = "Сервер не отвечает";
  }
}

// ---------- OTHER USERS PROFILE ----------

async function fetchUserProfile(username) {
  if (userProfileCache[username]) return userProfileCache[username];
  try {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    userProfileCache[username] = data;
    return data;
  } catch (e) {
    return null;
  }
}

// ---------- USERS LIST ----------

async function loadUsers() {
  try {
    const res = await fetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) { logout(); return; }
    allUsers = await res.json();
    allUsers.forEach(u => { userProfileCache[u.username] = u; });
    renderUsers();
  } catch (e) {
    console.error("Не удалось загрузить пользователей", e);
  }
}

function renderUsers() {
  const list = $("usersList");
  list.innerHTML = "";
  if (allUsers.length === 0) {
    list.innerHTML = `<div style="padding:14px;color:#888;">Пока нет других пользователей</div>`;
    return;
  }
  allUsers.forEach(u => {
    const div = document.createElement("div");
    div.className = "userItem";

    const avatarDiv = document.createElement("div");
    avatarDiv.className = "avatar small";
    renderAvatarInto(avatarDiv, u.username, u.avatar);

    const textDiv = document.createElement("div");
    textDiv.className = "userItemText";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = u.username;
    textDiv.appendChild(nameSpan);
    if (u.bio) {
      const bioSpan = document.createElement("span");
      bioSpan.className = "userItemBio";
      bioSpan.textContent = u.bio;
      textDiv.appendChild(bioSpan);
    }

    div.appendChild(avatarDiv);
    div.appendChild(textDiv);
    div.onclick = () => openChat(u.username);
    list.appendChild(div);
  });
}

// ---------- CHAT NAVIGATION ----------

async function openChat(username) {
  currentChatWith = username;
  $("chatWithLabel").textContent = username;
  $("chatPanel").classList.add("active");
  $("usersPanel").classList.add("hidden");
  $("profileScreen").classList.remove("active");

  const profile = await fetchUserProfile(username);
  renderAvatarInto($("chatAvatarSmall"), username, profile ? profile.avatar : "");

  await loadHistory(username);
}

function closeChat() {
  currentChatWith = null;
  $("chatPanel").classList.remove("active");
  $("usersPanel").classList.remove("hidden");
}

async function loadHistory(username) {
  $("messages").innerHTML = `<div style="text-align:center;color:#666;font-size:13px;">Загрузка...</div>`;
  try {
    const res = await fetch(`${API_BASE}/messages/${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) { logout(); return; }
    const history = await res.json();
    messageCache[username] = history.map(m => ({
      content: m.content,
      timestamp: m.timestamp,
      mine: myUserId !== null && m.sender_id === myUserId,
      delivered: m.delivered
    }));
    renderMessages(username);
  } catch (e) {
    $("messages").innerHTML = `<div style="text-align:center;color:#f44336;">Не удалось загрузить историю</div>`;
  }
}

function renderMessages(username) {
  const container = $("messages");
  container.innerHTML = "";
  const msgs = messageCache[username] || [];
  msgs.forEach(m => addMessageBubble(m.content, m.mine, m.timestamp, m.delivered));
  container.scrollTop = container.scrollHeight;
}

function addMessageBubble(content, mine, timestamp, delivered) {
  const container = $("messages");
  const div = document.createElement("div");
  div.className = "msg " + (mine ? "mine" : "theirs");
  const time = timestamp ? new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
  let tick = "";
  if (mine) {
    tick = delivered
      ? `<span class="tick delivered">${ICONS.tickTwo}</span>`
      : `<span class="tick">${ICONS.tickOne}</span>`;
  }
  div.innerHTML = `${escapeHtml(content)}<div class="meta">${time}${tick}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ---------- ЗВУК УВЕДОМЛЕНИЯ ----------

let audioCtx = null;

function playIncomingSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch (e) {
    // Браузер может блокировать звук до первого взаимодействия пользователя — это не критично
  }
}

// ---------- WEBSOCKET ----------

function connectWebSocket() {
  if (ws) ws.close();
  ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);

  ws.onopen = () => setStatus("онлайн", true);

  ws.onclose = () => {
    setStatus("отключено, переподключение...", false);
    // Простая переподготовка соединения через 3 секунды, если мы ещё залогинены
    if (token) setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = () => setStatus("ошибка соединения", false);

  ws.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    if (data.type === "error") {
      alert("Ошибка: " + data.detail);
      return;
    }

    if (data.type === "message") {
      // Входящее сообщение от другого пользователя
      const other = data.sender;
      if (!messageCache[other]) messageCache[other] = [];
      messageCache[other].push({ content: data.content, mine: false, timestamp: data.timestamp });
      if (currentChatWith === other) {
        addMessageBubble(data.content, false, data.timestamp);
      }
      playIncomingSound();
      // Обновим список пользователей на случай нового собеседника
      if (!allUsers.find(u => u.username === other)) {
        loadUsers();
      }
    }

    if (data.type === "ack") {
      // Подтверждение, что моё сообщение дошло до сервера (и доставлено получателю, если онлайн)
      const other = data.receiver;
      if (!messageCache[other]) messageCache[other] = [];
      messageCache[other].push({ content: data.content, mine: true, timestamp: data.timestamp, delivered: data.delivered });
      if (currentChatWith === other) {
        addMessageBubble(data.content, true, data.timestamp, data.delivered);
      }
    }
  };
}

function sendMessage() {
  const input = $("msgInput");
  const content = input.value.trim();
  if (!content || !currentChatWith) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert("Нет соединения с сервером, подожди переподключения");
    return;
  }
  ws.send(JSON.stringify({ receiver: currentChatWith, content }));
  input.value = "";
}

// ---------- EVENTS ----------

injectIcons();

$("loginBtn").onclick = login;
$("registerBtn").onclick = register;
$("logoutBtn").onclick = logout;
$("refreshUsers").onclick = loadUsers;
$("backBtn").onclick = closeChat;
$("sendBtn").onclick = sendMessage;
$("msgInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

$("meBlock").onclick = openMyProfile;
$("profileBackBtn").onclick = closeProfile;
$("saveProfileBtn").onclick = saveProfile;
$("avatarEditBtn").onclick = pickAvatarFile;
$("avatarFileInput").addEventListener("change", onAvatarFileChosen);

// ---------- INIT ----------

if (token && myUsername) {
  showApp();
} else {
  showAuth();
                            }
