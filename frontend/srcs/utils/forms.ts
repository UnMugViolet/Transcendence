import { BACKEND_URL } from "./config.js";
import { AuthManager } from "../user/auth.js";
import { UserManager } from "../user/user.js";
import { ModalManager } from "./modal.js";
import { initChatSocket } from "../user/chat.js";
import { AuthResponse } from "../types/types.js";
import { i18n } from "./i18n.js";
import { initPongBtns } from "../game/game.js";

/**
 * Form handling for authentication
 */
export class FormManager {
  /**
   * Sets up all form event listenersF
   */
  static setupFormListeners(): void {
    this.setupSignUpForm();
    this.setupSignInForm();
  }

  /**
   * Sets up the sign-up form
   */
  private static setupSignUpForm(): void {
    const formSignUp = document.getElementById("formSignUp") as HTMLFormElement | null;
    
    formSignUp?.addEventListener("submit", async (e: SubmitEvent) => {
      e.preventDefault();

      const formData = this.getSignUpFormData();
      if (!formData) return;

      const { username, password, passwordConfirm, stayConnected } = formData;
      const messageEl = document.getElementById("messageSignUp") as HTMLElement;

      if (password !== passwordConfirm) {
        messageEl.textContent = i18n.t("passwordMismatch");
        return;
      }

      try {
        const response = await fetch(`${BACKEND_URL}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: username,
            password: password,
            stayConnect: stayConnected,
            roleType: "user",
          }),
        });

        const data: AuthResponse = await response.json();
        if (!response.ok) {
          throw new Error(data.error || i18n.t("failedRegister"));
        }

        // Store authentication data
        AuthManager.storeTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken
        }, stayConnected);
        
        // Store user info for authentication
        const tokenParts = data.accessToken.split('.');
        if (tokenParts.length === 3) {
          const decoded = JSON.parse(atob(tokenParts[1]));
          AuthManager.storeUserInfo(username, decoded.id.toString(), stayConnected);
        }

        ModalManager.closeModal("modalSignUp");
        
        // Fetch complete user profile (including profile picture) from backend
        await UserManager.fetchUserProfile();
        
        initChatSocket(data.accessToken, () => {
          console.log("Chat WebSocket ready after signup");
        });

      } catch (err: any) {
        messageEl.textContent = "❌ " + err.message;
      }
    });
  }

  /**
   * Sets up the sign-in form
   */
  private static setupSignInForm(): void {
    const formSignIn = document.getElementById("formSignIn") as HTMLFormElement | null;

    formSignIn?.addEventListener("submit", async (e: SubmitEvent) => {
      e.preventDefault();

      const formData = this.getSignInFormData();
      if (!formData) return;

      const { username, password, stayConnected } = formData;
      const messageEl = document.getElementById("messageSignIn") as HTMLElement;

      try {
        const response = await fetch(`${BACKEND_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: username,
            password: password,
            stayConnect: stayConnected,
          }),
        });

        const data: AuthResponse = await response.json();
        if (!response.ok) {
          throw new Error(data.error || i18n.t("failedLogin"));
        }

        // Store authentication data
        AuthManager.storeTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken
        }, stayConnected);
        
        // Store user info for authentication
        const tokenParts = data.accessToken.split('.');
        if (tokenParts.length === 3) {
          const decoded = JSON.parse(atob(tokenParts[1]));
          AuthManager.storeUserInfo(username, decoded.id.toString(), stayConnected);
        }

        ModalManager.closeModal("modalSignIn");
        
        // Fetch complete user profile (including profile picture) from backend
        await UserManager.fetchUserProfile();
        
        initChatSocket(data.accessToken, () => {
          console.log("Chat WebSocket ready after login");
        });

      } catch (err: any) {
        messageEl.textContent = "❌ " + err.message;
      }
    });
  }

  /**
   * Gets sign-up form data
   */
  private static getSignUpFormData(): { 
    username: string; 
    password: string; 
    passwordConfirm: string; 
    stayConnected: boolean; 
  } | null {
    const usernameEl = document.getElementById("usernameSignUp") as HTMLInputElement;
    const passwordEl = document.getElementById("passwordSignUp") as HTMLInputElement;
    const passwordConfirmEl = document.getElementById("passwordSignUpConfirm") as HTMLInputElement;
    const stayConnectedEl = document.getElementById("staySignUp") as HTMLInputElement;

    if (!usernameEl || !passwordEl || !passwordConfirmEl || !stayConnectedEl) {
      console.error("Sign-up form elements not found");
      return null;
    }

    return {
      username: usernameEl.value.trim(),
      password: passwordEl.value.trim(),
      passwordConfirm: passwordConfirmEl.value.trim(),
      stayConnected: stayConnectedEl.checked,
    };
  }

  /**
   * Gets sign-in form data
   */
  private static getSignInFormData(): { 
    username: string; 
    password: string; 
    stayConnected: boolean; 
  } | null {
    const usernameEl = document.getElementById("usernameSignIn") as HTMLInputElement;
    const passwordEl = document.getElementById("passwordSignIn") as HTMLInputElement;
    const stayConnectedEl = document.getElementById("staySignIn") as HTMLInputElement;

    if (!usernameEl || !passwordEl || !stayConnectedEl) {
      console.error("Sign-in form elements not found");
      return null;
    }

    return {
      username: usernameEl.value.trim(),
      password: passwordEl.value.trim(),
      stayConnected: stayConnectedEl.checked,
    };
  }

  /**
   * Creates a demo user on the backend for temporary token users
   * @returns Promise<boolean> - true if demo user was created successfully
   */
  static async createDemoUser(): Promise<boolean> {

      // Call backend API to create demo user
      try {
        const DemoUserDataJson = await AuthManager.getDemoUserData();

        // Generate random username and password
        const demoUsername = AuthManager.generateRandomUsername(DemoUserDataJson);
        const password = AuthManager.generateRandomPassword();

        const response = await fetch(`${BACKEND_URL}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: demoUsername,
            password: password,
            stayConnect: false,
            roleType: "demo",
          }),
        })

        const data: AuthResponse = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to create demo user");
        }

        // Store new tokens in both sessionStorage and localStorage so they persist across refreshes
        AuthManager.storeTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken
        }, true); // Store in localStorage

        // Store user info for authentication
        const tokenParts = data.accessToken.split('.');
        if (tokenParts.length === 3) {
          const decoded = JSON.parse(atob(tokenParts[1]));
          AuthManager.storeUserInfo(demoUsername, decoded.id.toString(), true);
        }

        console.log("Demo user created successfully:", demoUsername);

        // Fetch complete user profile (including profile picture) from backend
        await UserManager.fetchUserProfile();
        
        // Re-initialize pong buttons to reflect demo user status
        initPongBtns();
        
        return true;
      }
      catch (error) {
        console.error("Error creating demo user:", error);
        return false;
      }
  }

  /**
   * Calls the backend to delete a given user base on their refresh token
   * @param refreshToken - The refresh token of the user to delete
   * @returns Promise<boolean> - true if demo user was deleted successfully
   */
  static async deleteUser(refreshToken: string): Promise<boolean> {
    try {

      const response = await fetch(`${BACKEND_URL}/user`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: refreshToken
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete user");
      }

      console.log("User deleted successfully");
      return true;
    }
    catch (error) {
      console.error("Error deleting user:", error);
      return false;
    }
  }
}
