import { BACKEND_URL } from "./config.js";
import { respondFriendRequest } from "./friends.js";
import { loadFriends } from "./friends.js";
import { i18n } from "./i18n.js";

let notifAnimationInterval: number | null = null;

function startLogoAnimation() {
  const logo = document.getElementById("notifLogo") as HTMLImageElement | null;
  if (!logo) return;

  let frame = 0;
  const frames = ["/img/notif/walkie-talkie.png", "/img/notif/walkie-talkie1.png", "/img/notif/walkie-talkie2.png"];

  if (notifAnimationInterval) clearInterval(notifAnimationInterval);

  notifAnimationInterval = setInterval(() => {
    logo.src = frames[frame];
    frame = (frame + 1) % frames.length;
  }, 300); // change de frame toutes les 300ms
  logo.classList.add("animate-pulse");
}

function stopLogoAnimation() {
  const logo = document.getElementById("notifLogo") as HTMLImageElement | null;
  if (!logo) return;

  if (notifAnimationInterval) {
    clearInterval(notifAnimationInterval);
    notifAnimationInterval = null;
  }

  logo.src = "/img/notif/walkie-talkie2.png"; // TODO - refresh to default image
  logo.classList.remove("animate-pulse");
}


export function initNotifications() {

  const notifBtn = document.querySelector("#notifications button");
  const notifPopup = document.getElementById("notifPopup");

  if (!notifBtn || !notifPopup) {
    console.warn("Cannot initialize notifications: elements not found");
    return;
  }

  notifBtn.addEventListener("click", async () => {
    await loadNotifications();
    notifPopup.classList.toggle("hidden");
	if (!notifPopup.classList.contains("hidden")) {
		stopLogoAnimation();
	}
  });
  document.addEventListener("click", (e) => {
    if (!notifPopup.classList.contains("hidden")) {
      const target = e.target as HTMLElement;
      if (!notifPopup.contains(target) && !notifBtn.contains(target)) {
        notifPopup.classList.add("hidden");
      }
    }
  });
  loadNotifications();
  setInterval(loadNotifications, 5000); // Reload every 5 seconds
}

export async function loadNotifications() {
  const token = sessionStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch(`${BACKEND_URL}/friends/requests`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || i18n.t("errorNotifications"));

    const notifList = document.getElementById("notifList");

    if (!notifList) return;

    notifList.innerHTML = ""; // reset

	if (data.requests.length > 0) {
		startLogoAnimation();
	} else {
		stopLogoAnimation();
	}

  // Update badge
  const notifBadge = document.getElementById("notifBadge");

  if (notifBadge) {
    if (data.requests.length > 0) {
      notifBadge.textContent = data.requests.length;
      notifBadge.classList.remove("hidden");
      notifBadge.classList.add("flex");
    } else {
      notifBadge.classList.add("hidden");
      notifBadge.classList.remove("flex");
    }
  }

	if (data.requests.length === 0) {
      const li = document.createElement("li");
      li.setAttribute("data-i18n", "noNotifications");
      li.className = "text-gray-400 text-sm";
      li.textContent = i18n.t("noNotifications");
      notifList.appendChild(li);
      return;
    }

    data.requests.forEach((req: any) => {
      const li = document.createElement("li");
      li.className = "flex justify-between items-center bg-gray-700 p-2 rounded";

      // Profil + name
      const left = document.createElement("div");
      left.className = "flex items-center gap-2";
      const img = document.createElement("img");
      img.src = `${BACKEND_URL}/img/${req.requester_pfp}` || `${BACKEND_URL}/img/default.png`;
      img.className = "w-8 h-8 rounded-full";
      img.style.objectFit = "cover";
      img.style.objectPosition = "center";
      const span = document.createElement("span");
      span.textContent = req.requester_name;
      left.appendChild(img);
      left.appendChild(span);

      // Buttons
      const actions = document.createElement("div");
      actions.className = "flex gap-2";
      const acceptBtn = document.createElement("button");
      acceptBtn.className = "bg-green-500 text-white px-2 py-1 rounded hover:bg-green-400";
      acceptBtn.setAttribute("data-i18n", "accept");
      acceptBtn.textContent = i18n.t("accept");
      acceptBtn.addEventListener("click", async () => {
        await respondFriendRequest(req.requester_id, true);
        await loadNotifications(); // recharge après action
		    await loadFriends(); // recharge liste amis
      });

      const rejectBtn = document.createElement("button");
      rejectBtn.className = "bg-red-500 text-white px-2 py-1 rounded hover:bg-red-400";
      rejectBtn.setAttribute("data-i18n", "reject");
      rejectBtn.textContent = i18n.t("reject");
      rejectBtn.addEventListener("click", async () => {
        await respondFriendRequest(req.requester_id, false);
        await loadNotifications();
      });

      actions.appendChild(acceptBtn);
      actions.appendChild(rejectBtn);

      li.appendChild(left);
      li.appendChild(actions);
      notifList.appendChild(li);
    });
  } catch (err) {
    console.error(err);
  }
}

