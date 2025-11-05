import { BACKEND_URL } from "../utils/config.js";
import { openChatWindow } from "./chat.js";
import { loadNotifications } from "../user/notif.js";
import { i18n } from "../utils/i18n.js";
// 🔹 Sidebar amis
const sidebarHandle = document.getElementById("sidebarHandle");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");

// Ouvre/ferme la sidebar
function toggleSidebar() {
  sidebar?.classList.toggle("-translate-x-full");
  overlay?.classList.toggle("hidden");

  if (!sidebar?.classList.contains("-translate-x-full")) {
    sidebarHandle?.classList.add("translate-x-64");
  } else {
    sidebarHandle?.classList.remove("translate-x-64");
  }
}

function closeSidebar() {
  sidebar?.classList.add("-translate-x-full");
  overlay?.classList.add("hidden");
  sidebarHandle?.classList.remove("translate-x-64");
}

// Fonction pour activer/désactiver la sidebar
export function setSidebarEnabled(enabled: boolean) {
  if (!sidebarHandle || !sidebar || !overlay) return;

  if (enabled) {
    sidebarHandle.classList.remove("opacity-50", "pointer-events-none");
    sidebarHandle.addEventListener("click", toggleSidebar);
    overlay.addEventListener("click", closeSidebar);
  } else {
    sidebarHandle.classList.add("opacity-50", "pointer-events-none");
    sidebarHandle.removeEventListener("click", toggleSidebar);
    overlay.removeEventListener("click", closeSidebar);
    closeSidebar();
  }
}

// Par défaut, sidebar désactivée
setSidebarEnabled(false);

// Input search
const searchInput = document.getElementById("friendSearch") as HTMLInputElement | null;
const searchResults = document.getElementById("searchResults") as HTMLElement | null;

// Recherche utilisateurs + ajout d'amis
async function searchUsers(query: string) {
  if (!query.trim() || !searchResults) {
    if (searchResults) searchResults.innerHTML = "";
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/users`, {
      headers: { "Authorization": `Bearer ${sessionStorage.getItem("token")}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch users");

    // filtre (mieux de le faire côté backend pour grande bdd)
    const filteredUsers = data.filter((u: any) =>
      u.name.toLowerCase().includes(query.toLowerCase())
    );

    searchResults.innerHTML = ""; // Reset
    filteredUsers.forEach((u: any) => {
      const div = document.createElement("div");
      div.className = "flex justify-between items-center bg-gray-700 text-white p-2 rounded hover:bg-gray-600";
      const span = document.createElement("span");
      span.textContent = u.name;
      const btn = document.createElement("button");
      btn.setAttribute("data-i18n", "addFriend");
      btn.className = "bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-400";
      btn.textContent = i18n.t("addFriend");
      btn.addEventListener("click", async () => {
        try {
          const resFriend = await fetch(`${BACKEND_URL}/friends/requests`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${sessionStorage.getItem("token")}`
            },
            body: JSON.stringify({ id: u.id })
          });


          const result = await resFriend.json();

          if (!resFriend.ok) {
            const msg = result.error || `${i18n.t("error")} ${resFriend.status}`;
            throw new Error(msg);
          }

          alert(`✅ ${i18n.t("friendRequestSent")} ${u.name}`);
        } catch (err: any) {
          console.error(err);
          alert(`❌ ${err.message}`);
        }
      });

      div.appendChild(btn);
      div.appendChild(span);
      searchResults.appendChild(div);
    });

  } catch (err: any) {
    console.error(err);
    if (searchResults) searchResults.innerHTML =
      `<p class='text-red-500'>❌ ${err.message}</p>`;
  }
}

searchInput?.addEventListener("input", (e) => {
  const target = e.target as HTMLInputElement;
  searchUsers(target.value);
});

// repondre aux demandes d'amis depuis les notifications
export async function respondFriendRequest(userId: number, accept: boolean) {
	const token = sessionStorage.getItem("token");
	if (!token) return;

  await fetch(`${BACKEND_URL}/friends/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      id: userId,
      status: accept ? i18n.t("accepted") : i18n.t("rejected")
    })
  });
}

// 🔹 Charger la liste d'amis
export async function loadFriends() {
  const token = sessionStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch(`${BACKEND_URL}/friends`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || i18n.t("errorFriends"));

    const friendsList = document.getElementById("friendsList");
    if (!friendsList) return;

    friendsList.innerHTML = ""; // reset

    if (data.friends.length === 0) {
      const li = document.createElement("li");
      li.className = "text-gray-400 text-sm";
      li.setAttribute("data-i18n", "noFriends");
      li.textContent = i18n.t("noFriends");
      friendsList.appendChild(li);
      return;
    }

    data.friends.forEach((friend: any) => {
      const li = document.createElement("li");
      li.className =
      "flex items-center justify-between bg-rose-700 p-2 rounded cursor-pointer hover:bg-rose-600";

      const left = document.createElement("div");
      left.className = "flex items-center gap-2";

      const img = document.createElement("img");
      img.src = `${BACKEND_URL}/img/${friend.friend_pfp}`;
      img.className = "w-8 h-8 rounded-full object-cover";
      img.style.objectPosition = "center";

        // Badge en ligne
      const onlineBadge = document.createElement("span");
      onlineBadge.className = friend.online === 'true'
        ? "w-2 h-2 bg-green-500 rounded-full inline-block"
        : "w-2 h-2 bg-gray-400 rounded-full inline-block";

      const span = document.createElement("span");
      span.textContent = friend.friend_name;

      left.appendChild(img);
      left.appendChild(span);
      left.appendChild(onlineBadge);

      li.appendChild(left);
      friendsList.appendChild(li);

      // Ouvre une fenêtre de chat en bas de l'écran au clic
      li.addEventListener("click", () => {
      openChatWindow(friend.friend_id, friend.friend_name, friend.friend_pfp);
      });
    });
    } catch (err) {
      console.error("Erreur loading friends:", err);
    }
  }




