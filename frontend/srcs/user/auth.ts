import { BACKEND_URL } from "../utils/config.js";
import { AuthTokens, StorageType, AuthResponse } from "../types/types.js";
import { UserManager } from "../user/user.js";
import { initChatSocket } from "../user/chat.js";

 /**
  * Authentication utilities and token management for frontend.
  * @class AuthManager
  */
export class AuthManager {

  /**
   * Gets the current authentication token try to fetch on sessionStorage or localStorage
   * @return string | null - The authentication token or null if not found
   */
  static getToken(): string | null {
    return sessionStorage.getItem("token") || localStorage.getItem("token");
  }

  /**
   * Checks if the provided token is a temporary offline token
   * @param token - The token to check
   * @return boolean - true if the token is a temporary offline token
   */
  static isTemporaryToken(token: string): boolean {
    return token.startsWith('temp-offline-token-');
  }

  /**
   * Gets the current refresh token
   * @return string | null - The refresh token or null if not found
   */
  static getRefreshToken(): string | null {
    return sessionStorage.getItem("refreshToken") || localStorage.getItem("refreshToken");
  }

  /**
   * Stores authentication tokens
   * @param tokens - The authentication tokens to store
   * @param persistent - Whether to store in localStorage (true) or sessionStorage (false)
   * @returns void
   */
  static storeTokens(tokens: AuthTokens, persistent: boolean = false): void {
    const storage: StorageType = persistent ? localStorage : sessionStorage;
    storage.setItem("token", tokens.accessToken);
    storage.setItem("refreshToken", tokens.refreshToken);
  }

  /**
   * Stores user information
   * @param username - The username to store
   * @param userId - The user ID to store
   * @param persistent - Whether to store in localStorage (true) or sessionStorage (false)
   * @returns void
   */
  static storeUserInfo(username: string, userId: string, persistent: boolean = false): void {
    const storage: StorageType = persistent ? localStorage : sessionStorage;
    storage.setItem("username", username);
    storage.setItem("userId", userId);
  }

  /**
   * Clears all authentication data
   * @returns void
   */
  static clearAuth(): void {
    sessionStorage.clear();
    localStorage.clear();
    console.log("Cleared authentication data");
  }

  /**
   * Checks if user is authenticated
   * @return boolean - true if both access and refresh tokens are present
   */
  static isAuthenticated(): boolean {
    return !!(this.getToken() && this.getRefreshToken());
  }

  /**
   * Generates a temporary offline token and store it in sessionStorage
   * This is a dummy token that will be deleted as soon as the user clicks on game modes requiring authentication
   * A Demo accoun will be created on the backend when using this token to play online
   * @returns string - The temporary token
   */
  static createTemporaryToken(): string {

    if (this.getToken()) {
      return this.getToken() as string;
    }
    const tempToken = 'temp-offline-token-' + Math.random().toString(36).substring(2);
    // Store in both sessionStorage and localStorage so it persists across refreshes
    sessionStorage.setItem("token", tempToken);
    localStorage.setItem("token", tempToken);
    return tempToken;
  }

  /**
   * Gets the storage type currently being used
   * @return StorageType - localStorage or sessionStorage
   */
  static getStorageType(): StorageType {
    return localStorage.getItem("token") ? localStorage : sessionStorage;
  }

  static async getDemoUserData(): Promise<{ names: string[]; adjectives: string[] }> {
    const res = await fetch('/dist/data/demo-user-data.json');
    if (!res.ok) {
      throw new Error('Failed to load demo user data');
    }
    return res.json();
  }

  static generateRandomUsername(demoData: { names: string[]; adjectives: string[] }): string {
    const randomName = demoData.names[Math.floor(Math.random() * demoData.names.length)];
    const randomAdjective = demoData.adjectives[Math.floor(Math.random() * demoData.adjectives.length)];
    return `${randomAdjective}_${randomName}_${Math.floor(Math.random() * 1000)}`;
  }

  /**
   * Generates a random password according to the password policy 
   * @returns string - The generated password
  */
  static generateRandomPassword(): string {
    const length = 8 + Math.floor(Math.random() * 4); // 8-12 characters
    let password = '';
    
    // Ensure at least one character from each required category
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    const allChars = lowercase + uppercase + numbers + special;
    
    // Start with one character from each category
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // Fill the rest with random characters
    for (let i = 4; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password to randomize position of required characters
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Creates a demo user on the backend for temporary token users
   * @returns Promise<boolean> - true if demo user was created successfully
   */
  static async createDemoUser(): Promise<boolean> {
    const userInfo = document.getElementById("userInfo") as HTMLElement | null;

      // Call backend API to create demo user
      try {
        const DemoUserDataJson = await this.getDemoUserData();

        // Generate random username and password
        const demoUsername = this.generateRandomUsername(DemoUserDataJson);
        const password = this.generateRandomPassword();

        console.log("Creating demo user with username:", demoUsername);

        const response = await fetch(`${BACKEND_URL}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: demoUsername,
            password: password,
            role: "demo",
            stayConnect: false,
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


        console.log("Demo user created successfully:", demoUsername);

        UserManager.setLoggedInState(demoUsername, undefined);
        
        return true;
      }
      catch (error) {
        console.error("Error creating demo user:", error);
        return false;
      }
  }

  /**
   * Ensures user is ready for online play by creating demo user if needed
   * this done by checking if the user has a role
   * @returns Promise<boolean> - true if user is ready for online play
   */
  static async ensureUserReady(): Promise<boolean> {
    const role = UserManager.getCurrentUserRole() as string | null;
    const token = this.getToken();

    // If user already has a token (demo or authenticated), they're ready
    if (token) {
      console.log("User has existing token, they're ready for online play");
      return true;
    }

    // Only create demo user if there's no token at all
    if (!role) {
      console.log("No role found, cannot ensure user is ready");
      return await this.createDemoUser();
    }


    return true; // User already has a role, no need to create demo user
  }
}
