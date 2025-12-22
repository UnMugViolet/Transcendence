import { AuthTokens, StorageType } from "../types/types.js";
import { UserManager } from "../user/user.js";
import { FormManager } from "../utils/forms.js";

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
    return sessionStorage.getItem("token") || localStorage.getItem("token"); // TODO check if token is expired and check if exists in database
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
    const otherStorage: StorageType = persistent ? sessionStorage : localStorage;
    
    // Clear the other storage to avoid conflicts
    otherStorage.removeItem("token");
    otherStorage.removeItem("refreshToken");
    
    // Store in the desired storage
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
  }

  /**
   * Checks if user is authenticated
   * @return boolean - true if both access and refresh tokens are present
   */
  static isAuthenticated(): boolean {
    return !!(this.getToken() && this.getRefreshToken());
  }

  /**
   * Checks if user has role demo
   * @return boolean - true if user role is demo
   */
  static isDemoUser(): boolean {
    return (UserManager.getCurrentUser()?.role?.name === 'demo') || false;
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
   * Ensures user is ready for online play by creating demo user if needed
   * If user is not authenticated, creates a demo account on the backend
   * @returns Promise<boolean> - true if user is ready for online play
   */
  static async ensureUserReady(): Promise<boolean> {
    const token = this.getToken();
    
    // If user already has a token (authenticated or demo), they're ready
    if (token) {
      console.log("User has existing token, ready for online play");
      return true;
    }

    // No token, create a demo user
    const result = await FormManager.createDemoUser();
    return result;
  }
}
