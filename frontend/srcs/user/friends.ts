import { BACKEND_URL } from "../utils/config.js";
import { openChatWindow } from "./chat.js";
import { i18n } from "../utils/i18n.js";

// Friends sidebar
const sidebarHandle = document.getElementById("sidebarHandle");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");

// Open close friends sidebar
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

// Function to activate / deactivate the sidebar
export function setSidebarEnabled(enabled: boolean) {
  if (!sidebarHandle || !sidebar || !overlay) {
    return;
  }

  if (enabled) {
    sidebarHandle.classList.remove("hidden", "pointer-events-none");
    sidebarHandle.addEventListener("click", toggleSidebar);
    overlay.addEventListener("click", closeSidebar);
  } else {
    sidebarHandle.classList.add("hidden", "pointer-events-none");
    sidebarHandle.removeEventListener("click", toggleSidebar);
    overlay.removeEventListener("click", closeSidebar);
    closeSidebar();
  }
}

// Set sidebar disabled by default
setSidebarEnabled(false);

// Input search
const searchInput = document.getElementById("friendSearch") as HTMLInputElement | null;
const searchResults = document.getElementById("searchResults") as HTMLElement | null;

// Search users + add friend / block user buttons
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

    const filteredUsers = data.filter((u: any) =>
      u.name.toLowerCase().includes(query.toLowerCase())
    );

    searchResults.innerHTML = ""; // Reset
    filteredUsers.forEach((u: any) => {
      const div = document.createElement("div");
      div.className =  "flex bg-gray-700/80 items-center justify-between w-full px-4 py-3 text-amber-100 hover:bg-white/5 transition";
      // User name
      const span = document.createElement("span");
      span.className = "text-sm font-semibold tracking-wide";
      span.textContent = u.name;
      // Container buttons
      const btnContainer = document.createElement("div");
      btnContainer.className = "flex items-center gap-4";
      // Add Friend button
      if (u.isBlocked.blocked_by_me) {
        // unblock User button
        const unblockBtn = document.createElement("button");
        unblockBtn.setAttribute("data-i18n", "unblockUser");
        unblockBtn.className =  "text-green-400 hover:text-green-300 text-sm font-medium transition";
        unblockBtn.textContent = i18n.t("unblockUser");
        unblockBtn.addEventListener("click", async () => {
          await unblockUserRequest(u);
        });
        btnContainer.appendChild(unblockBtn);
      } else{
        if (!u.isBlocked.blocked_by_user) {
          const addBtn = document.createElement("button");
          addBtn.setAttribute("data-i18n", "addFriend");
          addBtn.className =  "text-blue-400 hover:text-blue-300 text-sm font-medium transition";
          addBtn.textContent = i18n.t("addFriend");
          addBtn.addEventListener("click", async () => {
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
          btnContainer.appendChild(addBtn);
        }
        //block User button
        const blockBtn = document.createElement("button");
        blockBtn.setAttribute("data-i18n", "blockUser");
        blockBtn.className =  "text-red-400 hover:text-red-300 text-sm font-medium transition";
        blockBtn.textContent = i18n.t("blockUser");
        blockBtn.addEventListener("click", () => {
          blockUserRequest(u, div); 
        });

        btnContainer.appendChild(blockBtn);
      }

      div.appendChild(span);
      div.appendChild(btnContainer);
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

async function blockUserRequest(u:any, div:HTMLElement) {
  try {
    const resBlock = await fetch(`${BACKEND_URL}/block`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sessionStorage.getItem("token")}`
      },
      body: JSON.stringify({ id: u.id })
    });

    const result = await resBlock.json();

    if (!resBlock.ok) {
      const msg = result.error || `${i18n.t("error")} ${resBlock.status}`;
      throw new Error(msg);
    }
    
    alert(`✅ ${i18n.t("userBlocked")} ${u.name}`);
    if (div) div.remove();
  } catch (err: any) {
    console.error(err);
    alert(`❌ ${err.message}`);
  }
}

async function unblockUserRequest(u:any) {
  try {
    const resUnblock = await fetch(`${BACKEND_URL}/unblock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sessionStorage.getItem("token")}`
      },
      body: JSON.stringify({ id: u.id })
    });

    const result = await resUnblock.json();

    if (!resUnblock.ok) {
      const msg = result.error || `${i18n.t("error")} ${resUnblock.status}`;
      throw new Error(msg);
    }
    
    alert(`✅ ${i18n.t("userUnblocked")} ${u.name}`);
  } catch (err: any) {
    console.error(err);
    alert(`❌ ${err.message}`);
  }
}

// Answer friend request from notification
export async function respondFriendRequest(userId: number, accept: boolean) {
	const token = sessionStorage.getItem("token");
	if (!token) {
    return;
  }

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

export async function respondGameInvite(inviteId: number, accept: boolean) {
	const token = sessionStorage.getItem("token");
	if (!token) {
		return;
	}

	const res = await fetch(`${BACKEND_URL}/invite/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      inviteId: inviteId,
      status: accept ? i18n.t("accepted") : i18n.t("rejected")
    })
  	});
	if (!res.ok) {
      throw new Error('Failed to load demo user data');
    }
	return res.json();
}

export async function loadFriends() {
  const token = sessionStorage.getItem("token");
  if (!token) {
    return;
  }

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
      console.error("Error loading friends:", err);
    }
  }




