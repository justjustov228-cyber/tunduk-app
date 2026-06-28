// ======= НАСТРОЙКИ =======
const API_BASE = "https://tunduk-messenger.onrender.com";
const WS_BASE = "wss://tunduk-messenger.onrender.com";
// ==========================

let token = localStorage.getItem("tunduk_token") || null;
let myUsername = localStorage.getItem("tunduk_username") || null;
let myUserId = null;
let ws = null;
let currentChatWith = null;
let allUsers = [];
// Кэш сообщений по собеседнику: { "alice": [ {content, mine, timestamp, delivered}, ... ] }
let messageCache = {};

const $ = (id) => document.getElementById(id);

// ---------- SVG-ИКОНКИ ----------
// Простые inline SVG вместо эмодзи — чтобы одинаково выглядело на всех устройствах

const ICONS = {
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><polyline points="15 18 9 12 15 6"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  tickOne: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  tickTwo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 6 7 17 2 12"/><polyline points="22 6 11 17 9 15"/></svg>`,
};

function injectIcons() {
  $("refreshUsers").innerHTML = `${ICONS.refresh} Обновить список`;
  $("backBtn").innerHTML = ICONS.back;
  $("sendBtn").innerHTML = ICONS.send;
  $("logoutBtn").innerHTML = `${ICONS.logout} Выйти`;
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

async function loadMyId() {
  try {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) { logout(); return; }
    const me = await res.json();
    myUserId = me.id;
  } catch (e) {
    console.error("Не удалось получить свой ID", e);
  }
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
  localStorage.removeItem("tunduk_token");
  localStorage.removeItem("tunduk_username");
  messageCache = {};
  $("username").value = "";
  $("password").value = "";
  setStatus("не подключено", false);
  showAuth();
}

// ---------- USERS ----------

async function loadUsers() {
  try {
    const res = await fetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) { logout(); return; }
    allUsers = await res.json();
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
    div.textContent = u.username;
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

// ---------- INIT ----------

if (token && myUsername) {
  showApp();
} else {
  showAuth();
}
