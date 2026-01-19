import { ModalId } from "../types/types.js";
import { closeHeaderMenu } from "../user/header-menu.js";

/**
 * Modal management utilities
 */
export class ModalManager {
  /**
   * Opens a modal by removing 'hidden' class and adding 'flex' class
   */
  static openModal(id: ModalId): void {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
      
      // Clear error messages when opening auth modals
      if (id === "modalSignUp") {
        const messageEl = document.getElementById("messageSignUp");
        if (messageEl) {
           messageEl.textContent = "";
        }
      } else if (id === "modalSignIn") {
        const messageEl = document.getElementById("messageSignIn");
        if (messageEl) {
          messageEl.textContent = "";
        }
      }
    } else {
      console.error(`Modal ${id} not found`);
    }
  }

  /**
   * Closes a modal by adding 'hidden' class and removing 'flex' class
   */
  static closeModal(id: ModalId): void {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    } else {
      console.error(`Modal ${id} not found`);
    }
  }

  /**
   * Ensures modals start in hidden state
   */
  static initializeModals(): void {
    const modalIds: ModalId[] = ["modalSignUp", "modalSignIn", "modalProfile", "modalFriendProfile"];
    
    modalIds.forEach(modalId => {
      const modal = document.getElementById(modalId);
      if (modal) {
        this.closeModal(modalId);
      }
    });
  }

  /**
   * Sets up modal event listeners
   */
  static setupModalEventListeners(): void {
    // Open modal listeners
    document.getElementById("btnSignUp")?.addEventListener("click", () => {
      ModalManager.openModal("modalSignUp");
    });

    document.getElementById("btnSignIn")?.addEventListener("click", () => {
      ModalManager.openModal("modalSignIn");
    });

    // Close modal listeners
    document.getElementById("closeSignUp")?.addEventListener("click", () => {
      ModalManager.closeModal("modalSignUp");
    });
    
    document.getElementById("closeSignIn")?.addEventListener("click", () => {
      ModalManager.closeModal("modalSignIn");
    });

    document.getElementById("closeFriendProfile")?.addEventListener("click", () => {
      ModalManager.closeModal("modalFriendProfile");
    });

    document.getElementById("btnLogout")?.addEventListener("click", () => {
      if (ModalManager.logoutCallback) {
        ModalManager.logoutCallback();
      }
    });
  }

  // Callback for logout function to avoid circular dependency
  static logoutCallback: (() => void) | null = null;

  static setLogoutCallback(callback: () => void): void {
    this.logoutCallback = callback;
  }
}
