import { BACKEND_URL } from "./config.js";
import { AuthManager } from "../user/auth.js";
import { UserManager } from "../user/user.js";
import { ModalManager } from "./modal.js";
import { initChatSocket } from "../user/chat.js";
import { AuthResponse, LoginResponse } from "../types/types.js";
import { i18n } from "./i18n.js";
import { fetchCurrentLanguage } from "./langs.js";
import { initPongBtns } from "../game/game.js";
import { TwoFactorAuthManager } from "./twofa.js";
import { closeHeaderMenu } from "../user/header-menu.js";

/**
 * Form handling for authentication
 */
export class FormManager {
  private static extractAuthTokens(data: any): { accessToken: string; refreshToken: string } {
    const accessToken: unknown =
      data?.accessToken ??
      data?.newAccessToken ??
      data?.token ??
      data?.access_token;
    const refreshToken: unknown = data?.refreshToken ?? data?.refresh_token;

    if (typeof accessToken !== "string" || !accessToken) {
      throw new Error(`Missing access token in authentication response`);
    }
    if (typeof refreshToken !== "string" || !refreshToken) {
      throw new Error(`Missing refresh token in authentication response`);
    }

    return { accessToken, refreshToken };
  }

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

      const { username, password, passwordConfirm, stayConnected, enable2FA } = formData;
      const messageEl = document.getElementById("messageSignUp") as HTMLElement;

      if (password !== passwordConfirm) {
        messageEl.textContent = i18n.t("passwordMismatch");
        return;
      }

      try {
        const response = await fetch(`${BACKEND_URL}/register`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept-Language": fetchCurrentLanguage()
          },
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

        const tokens = this.extractAuthTokens(data);

        // If 2FA is requested at signup, require successful verification before continuing
        if (enable2FA) {
          const verified = await TwoFactorAuthManager.showSetupModal(tokens.accessToken, stayConnected, () => {
            console.log("2FA setup completed");
          }, { enforced: true });
          // If the user skips, proceed with normal login (2FA stays disabled because verify-enable wasn't called).
          if (!verified) {
            console.log("2FA setup skipped");
          }
        }

        // Store authentication data only after signup (+ optional 2FA setup) succeeds
        AuthManager.storeTokens({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }, stayConnected);

        // Store user info for authentication
        const tokenParts = tokens.accessToken.split('.');
        if (tokenParts.length === 3) {
          const decoded = JSON.parse(atob(tokenParts[1]));
          AuthManager.storeUserInfo(username, decoded.id.toString(), stayConnected);
        }

        ModalManager.closeModal("modalSignUp");

        // Fetch complete user profile (including profile picture) from backend
        await UserManager.fetchUserProfile();

        initChatSocket(tokens.accessToken, () => {
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
      if (!formData) {
        return;
      }

      const { username, password, stayConnected } = formData;
      let messageEl = document.getElementById("messageSignIn") as HTMLElement;

      try {
        const response = await fetch(`${BACKEND_URL}/login`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept-Language": fetchCurrentLanguage()
          },
          body: JSON.stringify({
            name: username,
            password: password,
            stayConnect: stayConnected,
          }),
        });

        const data: LoginResponse = await response.json();
        if (!response.ok) {
          throw new Error((data as any).error || i18n.t("failedLogin"));
        }

        // Check if 2FA is required
        if ((data as any).requiresTwoFA) {
          ModalManager.closeModal("modalSignIn");
          
          // Show 2FA verification modal
          TwoFactorAuthManager.showLoginModal((data as any).tempToken, stayConnected, async (code: string) => {
            try {
              // Complete login with 2FA code
              const verify2FAResponse = await fetch(`${BACKEND_URL}/login/2fa`, {
                method: "POST",
                headers: { 
                  "Content-Type": "application/json",
                  "Accept-Language": fetchCurrentLanguage()
                },
                body: JSON.stringify({
                  tempToken: (data as any).tempToken,
                  token: code,
                  stayConnect: stayConnected,
                }),
              });

              const verify2FAData = await verify2FAResponse.json();
              if (!verify2FAResponse.ok) {
                const msg2FAEl = document.getElementById("message2FALogin");
                if (msg2FAEl) {
                  msg2FAEl.textContent = `❌ ${verify2FAData.error || 'Invalid code'}`;
                }
                return;
              }

              // Complete login
              await this.completeLogin(verify2FAData as AuthResponse, username, stayConnected);
              
              TwoFactorAuthManager.closeLoginModal();
              closeHeaderMenu();
              
            } catch (err: any) {
              const msg2FAEl = document.getElementById("message2FALogin");
              if (msg2FAEl) {
                msg2FAEl.textContent = `❌ ${err.message}`;
              }
            }
          });

          return;
        }

        // Normal login without 2FA
        await this.completeLogin(data as AuthResponse, username, stayConnected);
        ModalManager.closeModal("modalSignIn");
        closeHeaderMenu();

      } catch (err: any) {
        messageEl.textContent = "❌ " + err.message;
      }
    });
  }

  /**
   * Complete login process after authentication
   */
  private static async completeLogin(data: AuthResponse, username: string, stayConnected: boolean): Promise<void> {
    const tokens = this.extractAuthTokens(data);
    // Store authentication data
    AuthManager.storeTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }, stayConnected);
    
    // Store user info for authentication
    const tokenParts = tokens.accessToken.split('.');
    if (tokenParts.length === 3) {
      const decoded = JSON.parse(atob(tokenParts[1]));
      AuthManager.storeUserInfo(username, decoded.id.toString(), stayConnected);
    }

    // Fetch complete user profile (including profile picture) from backend
    await UserManager.fetchUserProfile();
    
    initChatSocket(tokens.accessToken, () => {
      console.log("Chat WebSocket ready after login");
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
    enable2FA: boolean;
  } | null {
    const usernameEl = document.getElementById("usernameSignUp") as HTMLInputElement;
    const passwordEl = document.getElementById("passwordSignUp") as HTMLInputElement;
    const passwordConfirmEl = document.getElementById("passwordSignUpConfirm") as HTMLInputElement;
    const stayConnectedEl = document.getElementById("staySignUp") as HTMLInputElement;
    const enable2FAEl = document.getElementById("enable2FASignUp") as HTMLInputElement;

    if (!usernameEl || !passwordEl || !passwordConfirmEl || !stayConnectedEl) {
      console.error("Sign-up form elements not found");
      return null;
    }

    return {
      username: usernameEl.value.trim(),
      password: passwordEl.value.trim(),
      passwordConfirm: passwordConfirmEl.value.trim(),
      stayConnected: stayConnectedEl.checked,
      enable2FA: enable2FAEl?.checked || false,
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
          headers: { 
            "Content-Type": "application/json",
            "Accept-Language": fetchCurrentLanguage()
          },
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
