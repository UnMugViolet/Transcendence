import { ViewId } from "../types/types.js";
import { AuthManager } from "../user/auth.js";
import { loadUserDashboard } from "../user/dashboard.js";

/**
 * Application routing and view management
 */
export class Router {
  /**
   * Shows a specific view and hides others
   */
  static showView(viewId: ViewId): void {
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
    views.forEach((view) => (view as HTMLDivElement).classList.add("hidden"));

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
