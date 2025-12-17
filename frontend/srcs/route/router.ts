import { ViewId } from "../types/types.js";
import { AuthManager } from "../user/auth.js";

/**
 * Application routing and view management
 */
export class Router {
  /**
   * Shows a specific view and hides others
   */
  static showView(viewId: ViewId): void {
    const token = AuthManager.getToken();
    
    if (!token) {
      const allViews = document.querySelectorAll(".view");
      allViews.forEach((view) =>
        (view as HTMLDivElement).classList.add("hidden")
      );
      return;
    }

    const views = document.querySelectorAll(".view");
    views.forEach((view) => (view as HTMLDivElement).classList.add("hidden"));

    const targetView = document.getElementById(viewId);
    if (targetView) {
      targetView.classList.remove("hidden");
      targetView.classList.add("flex");
    }

    // Ensure pong menu (full-screen menu) is hidden except when explicitly showing it
    const pongMenu = document.getElementById('pongMenu');
    if (viewId === 'pongMenu') {
      pongMenu?.classList.remove('hidden');
      pongMenu?.classList.add('flex');
    } else {
      pongMenu?.classList.add('hidden');
      pongMenu?.classList.remove('flex');
    }
  }

  /**
   * Handles route changes based on URL hash
   */
  static handleRoute(): void {
    const hash = (document.location.hash || "#pongMenu") as string;
    
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
        Router.showView("userDashboard");
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
    window.addEventListener("hashchange", Router.handleRoute);
    Router.handleRoute();
  }
}

// Export for backward compatibility
export const showView = Router.showView.bind(Router);
export const handleRoute = Router.handleRoute.bind(Router);
