import { BACKEND_URL } from "./config.js";
import { AuthManager } from "./auth.js";
import { i18n } from "./i18n.js";

/**
 * HTTP client with automatic authentication and token refresh
 */
export class ApiClient {
  /**
   * Makes an authenticated request with automatic token refresh
   */
  static async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    let token = AuthManager.getToken();
    const refreshToken = AuthManager.getRefreshToken();
    
    if (!refreshToken && !token) {
      throw new Error(i18n.t("noToken"));
    }

    // Add authorization header
    options.headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };

    let response = await fetch(url, options);

    // Handle token expiration
    if (response.status === 401 && refreshToken) {
      const newToken = await this.refreshAccessToken(refreshToken);
      if (newToken) {
        // Retry with new token
        options.headers = {
          ...(options.headers || {}),
          Authorization: `Bearer ${newToken}`,
        };
        response = await fetch(url, options);
      }
    }

    return response;
  }

  /**
   * Refreshes the access token using the refresh token
   */
  private static async refreshAccessToken(refreshToken: string): Promise<string | null> {
    try {
      const refreshRes = await fetch(`${BACKEND_URL}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: refreshToken }),
      });

      if (!refreshRes.ok) {
        // Refresh failed, logout user
        AuthManager.clearAuth();
        throw new Error(i18n.t("sessionExpired"));
      }

      const data = await refreshRes.json();
      const newToken = data.newAccessToken;

      // Store the new token
      const storage = AuthManager.getStorageType();
      storage.setItem("token", newToken || "");

      return newToken;
    } catch (error) {
      console.error("Token refresh failed:", error);
      return null;
    }
  }

  /**
   * Makes a simple GET request
   */
  static async get(url: string): Promise<Response> {
    return this.fetchWithAuth(url, { method: "GET" });
  }

  /**
   * Makes a POST request with JSON data
   */
  static async post(url: string, data: any): Promise<Response> {
    return this.fetchWithAuth(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /**
   * Makes a PUT request with JSON data
   */
  static async put(url: string, data: any): Promise<Response> {
    return this.fetchWithAuth(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /**
   * Makes a DELETE request
   */
  static async delete(url: string): Promise<Response> {
    return this.fetchWithAuth(url, { method: "DELETE" });
  }
}
