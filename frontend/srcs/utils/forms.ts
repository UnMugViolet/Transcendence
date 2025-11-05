import { BACKEND_URL } from "./config.js";
import { AuthManager } from "../user/auth.js";
import { UserManager } from "../user/user.js";
import { ModalManager } from "./modal.js";
import { initChatSocket } from "../user/chat.js";
import { AuthResponse } from "../types/types.js";
import { i18n } from "./i18n.js";

/**
 * Form handling for authentication
 */
export class FormManager {
  /**
   * Sets up all form event listeners
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
            pass: password,
            stayConnect: stayConnected,
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
        
        AuthManager.storeUserInfo(username, "", stayConnected);

        ModalManager.closeModal("modalSignUp");
        
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
            pass: password,
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
        
        AuthManager.storeUserInfo(username, "", stayConnected);

        ModalManager.closeModal("modalSignIn");
        
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
}
