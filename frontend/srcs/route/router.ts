import { ViewId } from "../types/types.js";
import { AuthManager } from "../user/auth.js";
import { loadUserDashboard } from "../user/dashboard.js";

/**
 * Application routing and view management
 */
export class Router {
  /**
   * Hide any global overlays/menus/modals that are not part of a routed view.
   * This prevents fixed elements from lingering across hash navigation.
   */
  private static resetGlobalUI(): void {
    const hideModal = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add("hidden");
      el.classList.remove("flex");
    };

    const hideEl = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add("hidden");
    };

    // Header burger menu (mobile)
    const headerMenu = document.getElementById("headerMenu");
    const headerMenuOverlay = document.getElementById("headerMenuOverlay");
    const headerMenuHandle = document.getElementById("headerMenuHandle");
    if (headerMenu) {
      headerMenu.classList.add("translate-x-full");
      headerMenu.classList.remove("translate-x-0");
    }
    if (headerMenuOverlay) headerMenuOverlay.classList.add("hidden");
    if (headerMenuHandle) headerMenuHandle.setAttribute("aria-expanded", "false");

    // Dropdowns/popups
    hideEl("langDropdown");
    hideEl("notifPopup");

    // Friends sidebar overlay
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");
    const sidebarHandle = document.getElementById("sidebarHandle");
    if (sidebar) sidebar.classList.add("-translate-x-full");
    if (overlay) overlay.classList.add("hidden");
    if (sidebarHandle) sidebarHandle.classList.remove("translate-x-64");

    // Auth/Profile/2FA modals
    hideModal("modalSignIn");
    hideModal("modalSignUp");
    hideModal("modalProfile");
    hideModal("modalFriendProfile");
    hideModal("modal2FASetup");
    hideModal("modal2FALogin");

    // Game flow modals
    hideModal("modalGamePause");
    hideModal("modalReconnect");

    // Dashboard modal
    hideEl("matchHistoryModal");
  }

  /**
   * Shows a specific view and hides others
   */
  static showView(viewId: ViewId): void {
    Router.resetGlobalUI();

    const token = AuthManager.getToken();
    
    // Allow pongMenu to be shown without a token (for anonymous/logged-out users)
    if (!token && viewId !== "pongMenu") {
      const allViews = document.querySelectorAll(".view");
      allViews.forEach((view) =>
        (view as HTMLDivElement).classList.add("hidden")
      );
      return;
    }

    // Hide all views with .view class
    const views = document.querySelectorAll(".view");
    views.forEach((view) => {
      (view as HTMLDivElement).classList.add("hidden");
      (view as HTMLDivElement).classList.remove("flex");
    });

    // Ensure pong menu (full-screen menu) is hidden except when explicitly showing it
    const pongMenu = document.getElementById("pongMenu") as HTMLDivElement | null;
    if (pongMenu && viewId !== "pongMenu") {
      pongMenu.classList.add("hidden");
    }

    const targetView = document.getElementById(viewId);
    if (targetView) {
      targetView.classList.remove("hidden");
      targetView.classList.add("flex");
    } else {
      console.warn("NO - targetView was falsy!");
    }
  }

  /**
   * Handles route changes based on URL hash
   */
  static async handleRoute(): Promise<void> {
    const hash = (document.location.hash || "#pongMenu");
    
    switch (hash) {
      case "#viewGame":
        Router.showView("viewGame");
        break;
      case "#pongMenu":
        Router.showView("pongMenu");
        break;
      case "#lobby":
        Router.showView("lobby");
        break;
      case "#userDashboard":
        await loadUserDashboard();
        break;
      default:
        Router.showView("pongMenu");
        break;
    }
  }

  /**
   * Initializes the router
   */
  static init(): void {
    globalThis.addEventListener("hashchange", () => {
      Router.handleRoute();
    });
    Router.handleRoute();
  }
}

// Export for backward compatibility
export const showView = Router.showView.bind(Router);
export const handleRoute = Router.handleRoute.bind(Router);
