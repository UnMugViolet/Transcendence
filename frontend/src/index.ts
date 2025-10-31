import { BACKEND_URL } from "./config.js";
import { initNotifications } from "./notif.js";
import { loadFriends } from "./friends.js";
import { setSidebarEnabled } from "./friends.js";
import { initChatSocket } from "./chat.js";
import { closeChatSocket } from "./chat.js";
import { initPongBtns } from "./game.js";
import { navigateTo } from "./game.js";
import { gameId } from "./game.js";
import { i18n } from "./i18n.js";

function openModal(id: string) {
  document.getElementById(id)?.classList.remove("hidden");
}
function closeModal(id: string) {
  document.getElementById(id)?.classList.add("hidden");
}

document.getElementById("btnSignUp")?.addEventListener("click", () => openModal("modalSignUp"));
document.getElementById("btnSignIn")?.addEventListener("click", () => openModal("modalSignIn"));

// --- gestion fermeture ---
document.getElementById("closeSignUp")?.addEventListener("click", () => closeModal("modalSignUp"));
document.getElementById("closeSignIn")?.addEventListener("click", () => closeModal("modalSignIn"));

const langButton = document.getElementById("langButton")!;
const langDropdown = document.getElementById("langDropdown")!;
const currentFlag = document.getElementById("currentFlag") as HTMLImageElement;
const currentLangText = langButton.querySelector("span")!;

async function main() {
  const savedLang = localStorage.getItem('lang') || 'en';
  await i18n.init(savedLang);
  console.log('Lang loaded:', savedLang, Object.keys(i18n['translations'][savedLang]));

  i18n.updateDOM();

  document.getElementById('btn-fr')?.addEventListener('click', async () => {
    await i18n.loadLanguage('fr');
    i18n.updateDOM();
    localStorage.setItem('lang', 'fr');
  });

  document.getElementById('btn-en')?.addEventListener('click', async () => {
    await i18n.loadLanguage('en');
    i18n.updateDOM();
    localStorage.setItem('lang', 'en');
  });

  document.getElementById('btn-ch')?.addEventListener('click', async () => {
    await i18n.loadLanguage('ch');
    i18n.updateDOM();
    localStorage.setItem('lang', 'ch');
  });
}

main();

function setLoggedInState(username: string, profilePicture: string) {
  const authButtons = document.getElementById("authButtons");
  const userInfo = document.getElementById("userInfo");
  const btnLogout = document.getElementById("btnLogout");

  authButtons?.classList.add("hidden");
  btnLogout?.classList.remove("hidden");

  if (userInfo) {
    userInfo.classList.remove("hidden");
    const welcomeMessage = document.getElementById("welcomeMessage");
    if (welcomeMessage) welcomeMessage.textContent = username;

    const userAvatar = document.getElementById("userAvatar") as HTMLImageElement | null;
    if (userAvatar && profilePicture) {
      userAvatar.src = `${BACKEND_URL}/uploads/${profilePicture}`;
      userAvatar.addEventListener("click", () => {
        const profileModal = document.getElementById("modalProfile");
        if (profileModal) profileModal.classList.remove("hidden");
      });
    }
  }
  const notifEl = document.getElementById("notifications");
  if (notifEl) notifEl.classList.remove("hidden");

  initPongBtns();

  setSidebarEnabled(true);
  initNotifications();
  loadFriends();
  navigateTo('pongMenu', true);
  handleRoute();
}

export function getToken() {
  return sessionStorage.getItem("token") || localStorage.getItem("token");
}

function getRefreshToken() {
  return sessionStorage.getItem("refreshToken") || localStorage.getItem("refreshToken");
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  let token = getToken();
  const refreshToken = getRefreshToken();
  if (!refreshToken && !token) throw new Error(i18n.t("noToken"));

  options.headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

  let res = await fetch(url, options);
  if (res.status === 401 && refreshToken) {
    const refreshRes = await fetch(`${BACKEND_URL}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: refreshToken }),
    });

    if (!refreshRes.ok) {
      logout();
      throw new Error(i18n.t("sessionExpired"));
    }

    const data = await refreshRes.json();
    token = data.newAccessToken;
    // Store the new token in localStorage (or sessionStorage as needed)
    if (localStorage.getItem("refreshToken")){
      localStorage.setItem("token", token || "");
    } else {
      sessionStorage.setItem("token", token || "");
    }

    options.headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };
    res = await fetch(url, options);
  }
  return res;
}

async function fetchUserProfile() {
  try {
    const res = await fetchWithAuth(`${BACKEND_URL}/profile`);
    const data = await res.json();
    if (res.ok && data.user) {
      setLoggedInState(data.user.name, data.user.profile_picture);
      const storage = localStorage.getItem("token") ? localStorage : sessionStorage;
      storage.setItem("userId", data.user.id.toString());
    }
  } catch (error) {
    console.error("Error fetching user profile:", error);
    logout();
  }
}

// 🔹 soumission Sign Up
const formSignUp = document.getElementById("formSignUp") as HTMLFormElement | null;
formSignUp?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = (document.getElementById("usernameSignUp") as HTMLInputElement).value.trim();
  const password = (document.getElementById("passwordSignUp") as HTMLInputElement).value.trim();
  const passwordConfirm = (document.getElementById("passwordSignUpConfirm") as HTMLInputElement).value.trim();
  const messageEl = document.getElementById("messageSignUp") as HTMLElement;
  const stayConnected = (document.getElementById("staySignUp") as HTMLInputElement).checked;

  if (password !== passwordConfirm) {
    messageEl.textContent = i18n.t("passwordMismatch");
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, pass: password, stayConnect: stayConnected }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || i18n.t("failedRegister"));

    const storage = stayConnected ? localStorage : sessionStorage;
    storage.setItem("username", username);
    storage.setItem("token", data.accessToken);
    storage.setItem("refreshToken", data.refreshToken);
    closeModal("modalSignUp");
    fetchUserProfile().then(() => {
      initChatSocket(data.accessToken, () => {
        console.log("Chat WebSocket ready after signup");
      });
    });
  } catch (err: any) {
    messageEl.textContent = "❌ " + err.message;
  }
});

// 🔹 soumission Sign In
const formSignIn = document.getElementById("formSignIn") as HTMLFormElement | null;
formSignIn?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = (document.getElementById("usernameSignIn") as HTMLInputElement).value.trim();
  const password = (document.getElementById("passwordSignIn") as HTMLInputElement).value.trim();
  const messageEl = document.getElementById("messageSignIn") as HTMLElement;
  const stayConnected = (document.getElementById("staySignIn") as HTMLInputElement).checked;

  try {
    const res = await fetch(`${BACKEND_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username, pass: password, stayConnect: stayConnected }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || i18n.t("failedLogin"));

    const storage = stayConnected ? localStorage : sessionStorage;
    storage.setItem("username", username);
    storage.setItem("token", data.accessToken);
    storage.setItem("refreshToken", data.refreshToken);
    closeModal("modalSignIn");
    fetchUserProfile().then(() => {
      initChatSocket(data.accessToken, () => {
        console.log("Chat WebSocket ready after login");
      });
    });
  } catch (err: any) {
    messageEl.textContent = "❌ " + err.message;
  }
});

langButton.addEventListener("click", () => {
  langDropdown.classList.toggle("hidden");
});

// Fermer le menu quand on clique ailleurs
document.addEventListener("click", (e) => {
  if (!langButton.contains(e.target as Node) && !langDropdown.contains(e.target as Node)) {
    langDropdown.classList.add("hidden");
  }
});

// Gérer le changement de langue
langDropdown.querySelectorAll("button[data-lang]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const lang = btn.getAttribute("data-lang")!;
    await i18n.loadLanguage(lang);
    localStorage.setItem("lang", lang);
    currentFlag.src = `upload/flags/${lang}.png`;
    currentLangText.textContent = lang.toUpperCase();
    langDropdown.classList.add("hidden");
  });
});


function logout() {
  const authButtons = document.getElementById("authButtons");
  const userInfo = document.getElementById("userInfo");
  const btnLogout = document.getElementById("btnLogout");

  sessionStorage.clear();
  localStorage.clear();

  authButtons?.classList.remove("hidden");
  authButtons?.classList.add("flex", "justify-end");

  btnLogout?.classList.add("hidden");

  if (userInfo) {
    userInfo.classList.add("hidden");
  }

  const chatWindows = document.querySelectorAll("[id^='chat-window-']");
  chatWindows.forEach((win) => win.remove());

  const inputName = document.getElementById("usernameSignIn") as HTMLInputElement | null;
  const inputPass = document.getElementById("passwordSignIn") as HTMLInputElement | null;
  if (inputName) inputName.value = "";
  if (inputPass) inputPass.value = "";

  const notifEl = document.getElementById("notifications");
  if (notifEl) notifEl.classList.add("hidden");

  setSidebarEnabled(false);
  closeChatSocket();
  history.replaceState(null, "", "/");
  window.onpopstate = () => {
    history.replaceState(null, "", "/");
  };
  handleRoute();
}

function showView(viewId: string) {
  const token = getToken();
  if (!token) {
    const allViews = document.querySelectorAll(".view");
    allViews.forEach(view => (view as HTMLDivElement).classList.add("hidden"));
    return;
  }

  const views = document.querySelectorAll(".view");
  views.forEach(view => (view as HTMLDivElement).classList.add("hidden"));

  const targetView = document.getElementById(viewId);
  if (targetView) targetView.classList.remove("hidden");
}

export function handleRoute() {
  const hash = document.location.hash || "pongMenu";
  switch (hash) {
    case "#viewGame":
      showView("viewGame");
      break;
    case "#pongMenu":
      showView("pongMenu");
      break;
    case "#lobby":
      showView("lobby");
      break;
    default:
      showView("pongMenu");
      break;
  }
}

window.addEventListener("hashchange", handleRoute);

document.addEventListener("DOMContentLoaded", async () => {
  const savedLang = localStorage.getItem("lang") || "en";
  await i18n.init(savedLang);
  
  const token = getToken();
  const authButtons = document.getElementById("authButtons");
  
  if (token) {
    fetchUserProfile().then(() => {
      initChatSocket(token, () => {
        console.log("Chat WebSocket ready on page load");
      });
      handleRoute();
    });
  } else {
    setSidebarEnabled(false);
    handleRoute();

    authButtons?.classList.remove("hidden");
    authButtons?.classList.add("flex");
  }
});

// 🔹 Logout event listener
document.getElementById("btnLogout")?.addEventListener("click", logout);


