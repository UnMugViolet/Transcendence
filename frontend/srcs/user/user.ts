import { BACKEND_URL } from "../utils/config.js";
import { AuthManager } from "./auth.js";
import { ApiClient } from "../utils/api.js";
import { User } from "../types/types.js";
import { setSidebarEnabled } from "./friends.js";
import { closeChatSocket, initChatSocket } from "./chat.js";
import { initPongBtns, navigateTo } from "../game/game.js";
import { initNotifications } from "./notif.js";
import { handleRoute } from "../route/router.js";

import { loadFriends } from "./friends.js";

/**
 * User management and authentication state
 */
export class UserManager implements User {
  id: number;
  name: string;
  profile_picture?: string | undefined;

  constructor(id: number, name: string, profile_picture?: string) {
    this.id = id;
    this.name = name;
    this.profile_picture = profile_picture;
  }

  /**
   * Gets the current user instance
   */
  static currentUser: UserManager | null = null;

  /**
   * Creates a new user instance and sets it as current
   */
  static createUser(id: number, name: string, profile_picture?: string): UserManager {
    this.currentUser = new UserManager(id, name, profile_picture);
    return this.currentUser;
  }

  /**
   * Gets the current user or null if not logged in
   */
  static getCurrentUser(): UserManager | null {
    return this.currentUser;
  }

  /**
   * Clears the current user instance
   */
  static clearCurrentUser(): void {
    this.currentUser = null;
  }

  /**
   * Updates the current user's profile information
   */
  updateProfile(name?: string, profile_picture?: string): void {
    if (name !== undefined) this.name = name;
    if (profile_picture !== undefined) this.profile_picture = profile_picture;
  }

  /**
   * Gets the user's profile picture URL
   */
  getProfilePictureUrl(): string | null {
    return this.profile_picture ? `${BACKEND_URL}/img/${this.profile_picture}` : null;
  }

  /**
   * Sets the UI state for a logged-in user
   */
  static setLoggedInState(username: string, profilePicture?: string): void {
    const authButtons = document.getElementById("authButtons");
    const userInfo = document.getElementById("userInfo");
    const btnLogout = document.getElementById("btnLogout");

    // Hide auth buttons
    authButtons?.classList.add("hidden");

    // Show logout button
    btnLogout?.classList.remove("hidden");
    btnLogout?.classList.add("flex");

    // Show user info
    if (userInfo) {
      userInfo.classList.remove("hidden");
      userInfo.classList.add("flex");
      
      const welcomeMessage = document.getElementById("welcomeMessage");
      if (welcomeMessage) welcomeMessage.textContent = username;

      // Set user avatar
      if (profilePicture) {
        this.setUserAvatar(profilePicture);
      }
    }

    // Show notifications
    const notifEl = document.getElementById("notifications");
    if (notifEl) {
       notifEl.classList.remove("hidden");
    }

    // Initialize user-specific features
    initPongBtns();
    setSidebarEnabled(true);
    initNotifications();
    loadFriends();
    navigateTo("#pongMenu", true);
    handleRoute();
  }

  /**
   * Sets the user avatar and click handler
   */
  private static setUserAvatar(profilePicture: string): void {
    const userAvatar = document.getElementById("userAvatar") as HTMLImageElement | null;
    if (userAvatar) {
      userAvatar.src = `${BACKEND_URL}/img/${profilePicture}`;
      userAvatar.addEventListener("click", () => {
        const profileModal = document.getElementById("modalProfile");
        if (profileModal) {
			profileModal.classList.remove("hidden");
			profileModal.classList.add("flex");
		}
      });
    }
  }

  /**
   * Fetches and sets up user profile
   */
  static async fetchUserProfile(): Promise<void> {
    try {
      const response = await ApiClient.get(`${BACKEND_URL}/profile`);
      const data = await response.json();
      
      if (response.ok && data.user) {
        this.setLoggedInState(data.user.name, data.user.profile_picture);
        AuthManager.storeUserInfo(data.user.name, data.user.id.toString(), 
          AuthManager.getStorageType() === localStorage);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
      this.logout();
    }
  }

  /**
   * Logs out the user and resets UI state
   */
  static logout(): void {
    const authButtons = document.getElementById("authButtons");
    const userInfo = document.getElementById("userInfo");
    const btnLogout = document.getElementById("btnLogout");

    console.log("Logging out user");
    // Clear authentication data
    AuthManager.clearAuth();

    // Show auth buttons
    authButtons?.classList.remove("hidden");
    authButtons?.classList.add("flex", "justify-end");

    // Hide logout button
    btnLogout?.classList.add("hidden");

    // Hide user info
    if (userInfo) {
      userInfo.classList.add("hidden");
    }

    // Clean up chat windows
    const chatWindows = document.querySelectorAll("[id^='chat-window-']");
    chatWindows.forEach((win) => win.remove());

    // Clear form inputs
    this.clearAuthForms();

    // Hide notifications
    const notifEl = document.getElementById("notifications");
    if (notifEl) notifEl.classList.add("hidden");

    // Disable user features
    setSidebarEnabled(false);
    closeChatSocket();
    
    // Reset browser history
    history.replaceState(null, "", "/");
    window.onpopstate = () => {
      history.replaceState(null, "", "/");
    };
    
    handleRoute();
  }

  /**
   * Clears authentication form inputs
   */
  private static clearAuthForms(): void {
    const inputName = document.getElementById("usernameSignIn") as HTMLInputElement | null;
    const inputPass = document.getElementById("passwordSignIn") as HTMLInputElement | null;
    
    if (inputName) inputName.value = "";
    if (inputPass) inputPass.value = "";
  }
}

// Export for backward compatibility
export const setLoggedInState = UserManager.setLoggedInState.bind(UserManager);
export const fetchUserProfile = UserManager.fetchUserProfile.bind(UserManager);
export const logout = UserManager.logout.bind(UserManager);
