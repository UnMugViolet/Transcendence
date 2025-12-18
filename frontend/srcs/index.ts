import { AuthManager } from "./user/auth.js";
import { ModalManager } from "./utils/modal.js";
import { FormManager } from "./utils/forms.js";
import { UserManager } from "./user/user.js";
import { Router } from "./route/router.js";
import { populateLanguageDropdown, initLanguageButton } from "./utils/langs.js";
import { initChatSocket } from "./user/chat.js";
import { setSidebarEnabled } from "./user/friends.js";
import { i18n } from "./utils/i18n.js";
import { initNotifications } from "./user/notif.js";
import { initPongBtns } from "./game/game.js";

/**
 * Language dropdown setup
 */
class LanguageManager {
  private static langButton: HTMLElement | null = null;
  private static langDropdown: HTMLElement | null = null;
  private static currentFlag: HTMLElement | null = null;
  private static currentLangText: HTMLElement | null = null;
  static readonly availableLangs: string[] = ["en", "fr", "ch"];

  static init(): void {
    this.langButton = document.getElementById("langButton");
    this.langDropdown = document.getElementById("langDropdown");
    this.currentFlag = document.getElementById("currentFlag");
    this.currentLangText = this.langButton?.querySelector("span") || null;

    this.setupEventListeners();
  }

  private static setupEventListeners(): void {
    if (!this.langButton || !this.langDropdown) return;

    // Toggle dropdown
    this.langButton.addEventListener("click", () => {
      this.langDropdown?.classList.toggle("hidden");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!this.langButton || !this.langDropdown) return;

      if (
        !this.langButton.contains(e.target as Node) &&
        !this.langDropdown.contains(e.target as Node)
      ) {
        this.langDropdown.classList.add("hidden");
      }
    });

    // Handle language changes
    this.langDropdown.querySelectorAll("button[data-lang]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const lang = btn.getAttribute("data-lang");
        if (!lang || !this.currentFlag || !this.currentLangText) return;

        const image = this.currentFlag as HTMLImageElement;
        
        await i18n.loadLanguage(lang);
        localStorage.setItem("lang", lang);
        image.src = `img/flags/${lang}.png`;
        this.currentLangText.textContent = lang.toUpperCase();
        this.langDropdown?.classList.add("hidden");
      });
    });
  }

  static async initializeLanguages(): Promise<void> {
    const savedLang = localStorage.getItem("lang") || "en";
    await i18n.init(savedLang);
    i18n.updateDOM();
    initLanguageButton();
    populateLanguageDropdown(this.availableLangs);
  }
}

/**
 * Application initialization and setup
 */
class Application {
  static async init(): Promise<void> {
    await this.setupDOMContentLoaded();
  }

  private static async setupDOMContentLoaded(): Promise<void> {
    document.addEventListener("DOMContentLoaded", async () => {
      try {
        // Initialize language system
        await LanguageManager.initializeLanguages();

        // Initialize UI components
        ModalManager.initializeModals();
        ModalManager.setupModalEventListeners();
        
        // Set up logout callback to avoid circular dependency
        ModalManager.setLogoutCallback(async () => {
          await UserManager.logout();
        });
        
        FormManager.setupFormListeners();
        LanguageManager.init();
        Router.init();
        initPongBtns();

        // Handle authentication state
        await this.handleAuthenticationState();

      } catch (error) {
        console.error("Application initialization failed:", error);
      }
    });
  }

  private static async handleAuthenticationState(): Promise<void> {
    const token = AuthManager.getToken();
    const authButtons = document.getElementById("authButtons");

    if (token && AuthManager.isAuthenticated()) {
      // User is authenticated
      await UserManager.fetchUserProfile();
      initChatSocket(token, () => {
        console.log("Chat WebSocket ready on page load");
      });
    } else {
      // User is not authenticated
      setSidebarEnabled(false);
      authButtons?.classList.remove("hidden");
      authButtons?.classList.add("flex");
    }

    Router.handleRoute();
  }
}

// Initialize the application
Application.init();

// Export for backward compatibility
export { AuthManager } from "./user/auth.js";
export { ModalManager } from "./utils/modal.js";
export { UserManager } from "./user/user.js";
export { Router } from "./route/router.js";

// Legacy exports
export const getToken = AuthManager.getToken.bind(AuthManager);
export const openModal = ModalManager.openModal.bind(ModalManager);
export const closeModal = ModalManager.closeModal.bind(ModalManager);
export const logout = UserManager.logout.bind(UserManager);
export const handleRoute = Router.handleRoute.bind(Router);
