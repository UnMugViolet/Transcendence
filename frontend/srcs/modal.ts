import { ModalId } from "./types.js";

/**
 * Modal management utilities
 */
export class ModalManager {
  /**
   * Opens a modal by removing 'hidden' class and adding 'flex' class
   */
  static openModal(id: ModalId): void {
    console.log("Opening modal:", id);
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("flex");
      console.log(`Modal ${id} opened successfully`);
    } else {
      console.error(`Modal ${id} not found`);
    }
  }

  /**
   * Closes a modal by adding 'hidden' class and removing 'flex' class
   */
  static closeModal(id: ModalId): void {
    console.log("Closing modal:", id);
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
      console.log(`Modal ${id} closed successfully`);
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
        modal.classList.add("hidden");
        modal.classList.remove("flex");
      }
    });
  }

  /**
   * Sets up modal event listeners
   */
  static setupModalEventListeners(): void {
    // Open modal listeners
    document.getElementById("btnSignUp")?.addEventListener("click", () => {
      console.log("Sign Up button clicked");
      ModalManager.openModal("modalSignUp");
    });

    document.getElementById("btnSignIn")?.addEventListener("click", () => {
      console.log("Sign In button clicked");
      ModalManager.openModal("modalSignIn");
    });

    // Close modal listeners
    document.getElementById("closeSignUp")?.addEventListener("click", () => 
      ModalManager.closeModal("modalSignUp")
    );
    
    document.getElementById("closeSignIn")?.addEventListener("click", () => 
      ModalManager.closeModal("modalSignIn")
    );

    document.getElementById("closeFriendProfile")?.addEventListener("click", () => 
      ModalManager.closeModal("modalFriendProfile")
    );

    document.getElementById("btnLogout")?.addEventListener("click", () => {
      // Use a simple callback approach to avoid circular dependency
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
