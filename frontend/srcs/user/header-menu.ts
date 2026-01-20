import { leaveGame, navigateTo, gameId, showGoodbyeAndLeave } from "../game/game.js";
import { handleRoute } from "../index.js";


const headerMenuHandle = document.getElementById("headerMenuHandle");
const headerMenu = document.getElementById("headerMenu");
const headerMenuOverlay = document.getElementById("headerMenuOverlay");
const headerUserSlot = document.getElementById("headerUserSlot");
const userInfo = document.getElementById("userInfo");

const desktopQuery = window.matchMedia("(min-width: 768px)");

function openHeaderMenu() {
  if (desktopQuery.matches) return;
  headerMenu?.classList.remove("translate-x-full");
  headerMenu?.classList.add("translate-x-0");
  headerMenuOverlay?.classList.remove("hidden");
  headerMenuHandle?.setAttribute("aria-expanded", "true");
}

export function closeHeaderMenu(): void {
  if (desktopQuery.matches) {
    headerMenuOverlay?.classList.add("hidden");
    headerMenuHandle?.setAttribute("aria-expanded", "false");
    return;
  }

  headerMenu?.classList.add("translate-x-full");
  headerMenu?.classList.remove("translate-x-0");
  headerMenuOverlay?.classList.add("hidden");
  headerMenuHandle?.setAttribute("aria-expanded", "false");
}

function toggleHeaderMenu() {
  if (!headerMenu || desktopQuery.matches) {
    return;
  }

  if (headerMenu.classList.contains("translate-x-full")) {
    openHeaderMenu();
    return;
  }

  closeHeaderMenu();
}

export function initHeaderMenu(): void {
  if (!headerMenuHandle || !headerMenu || !headerMenuOverlay) return;

  // Ensure consistent state when switching between mobile/desktop.
  const syncState = () => {
    if (desktopQuery.matches) {
      if (userInfo && headerUserSlot && userInfo.parentElement !== headerUserSlot) {
        headerUserSlot.appendChild(userInfo);
      }
      headerMenu.classList.remove("translate-x-full");
      headerMenu.classList.remove("translate-x-0");
      headerMenuOverlay.classList.add("hidden");
      headerMenuHandle.setAttribute("aria-expanded", "false");
      return;
    }

    // Mobile: ensure the profile sits at the very top of the burger panel
    if (userInfo && userInfo.parentElement !== headerMenu) {
      headerMenu.insertBefore(userInfo, headerMenu.firstChild);
    } else if (userInfo && headerMenu.firstChild !== userInfo) {
      headerMenu.insertBefore(userInfo, headerMenu.firstChild);
    }

    if (!headerMenu.classList.contains("translate-x-full") && !headerMenu.classList.contains("translate-x-0")) {
      headerMenu.classList.add("translate-x-full");
    }
    headerMenuOverlay.classList.add("hidden");
    headerMenuHandle.setAttribute("aria-expanded", "false");
  };

  syncState();
  desktopQuery.addEventListener("change", syncState);

  headerMenuHandle.addEventListener("click", (e) => {
    e.preventDefault();
    toggleHeaderMenu();
  });

  headerMenuOverlay.addEventListener("click", () => {
    closeHeaderMenu();
  });
}

function checkVisibilityAndHide(id: string): void {
  const element = document.getElementById(id);
  if (element && !element.classList.contains("hidden")) {
    element.classList.add("hidden");
  }
}

export function initNavigateToMenu(): void {
  const headerTitle = document.getElementById("headerTitle") as HTMLElement;
  const pongMenu = document.getElementById("pongMenu") as HTMLElement;
  const elements = ["lobby", "userDashboard", "viewGame"];

  if (!headerTitle)
    return ;

  headerTitle.addEventListener("click", async () => {
    // Get the current view dynamically
    const currentView = location.hash.slice(1) || 'pongMenu';
``
    // If in viewGame or lobby with active game, properly leave it
    if (currentView === 'lobby') {
      console.log("Leaving game/lobby and returning to menu...");
      // Always call leaveGame to properly cleanup - it handles all states
      // including countdown, waiting, and active game
      await leaveGame({ navigate: false, resetState: true, closeSocket: true });
    }
	if (currentView === 'viewGame') {
		await showGoodbyeAndLeave({ navigate: false, resetState: true, closeSocket: true });
	}

    // Just navigate to menu for other views
    navigateTo('pongMenu', true, false);
    handleRoute();
  });
}
