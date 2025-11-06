import { AuthTokens, StorageType } from "../types/types.js";

/**
 * Authentication utilities and token management
 */
export class AuthManager {
  /**
   * Gets the current authentication token try to fetch on sessionStorage or localStorage
   */
  static getToken(): string | null {
    return sessionStorage.getItem("token") || localStorage.getItem("token");
  }

  /**
   * Gets the current refresh token
   */
  static getRefreshToken(): string | null {
    return sessionStorage.getItem("refreshToken") || localStorage.getItem("refreshToken");
  }

  /**
   * Stores authentication tokens
   */
  static storeTokens(tokens: AuthTokens, persistent: boolean = false): void {
    const storage: StorageType = persistent ? localStorage : sessionStorage;
    storage.setItem("token", tokens.accessToken);
    storage.setItem("refreshToken", tokens.refreshToken);
  }

  /**
   * Stores user information
   */
  static storeUserInfo(username: string, userId: string, persistent: boolean = false): void {
    const storage: StorageType = persistent ? localStorage : sessionStorage;
    storage.setItem("username", username);
    storage.setItem("userId", userId);
  }

  /**
   * Clears all authentication data
   */
  static clearAuth(): void {
    sessionStorage.clear();
    localStorage.clear();
    console.log("Cleared authentication data");
  }

  /**
   * Checks if user is authenticated
   */
  static isAuthenticated(): boolean {
    return !!(this.getToken() && this.getRefreshToken());
  }

  /**
   * Gets the storage type currently being used
   */
  static getStorageType(): StorageType {
    return localStorage.getItem("token") ? localStorage : sessionStorage;
  }
}
