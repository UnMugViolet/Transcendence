import { BACKEND_URL } from "./config.js";
import { AuthManager } from "../user/auth.js";
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
    
    if (!token && !refreshToken) {
      throw new Error(i18n.t("noToken"));
    }

    // Add authorization header
    options.headers = {
      ...(options.headers),
      Authorization: `Bearer ${token}`,
    };

    let response = await fetch(url, options);

    // Handle token expiration - try to refresh
    if (response.status === 401 && refreshToken) {
      console.log("Access token expired, attempting refresh...");
      const newToken = await this.refreshAccessToken(refreshToken);
      if (newToken) {
        // Retry with new token
        options.headers = {
          ...(options.headers),
          Authorization: `Bearer ${newToken}`,
        };
        response = await fetch(url, options);
      } else {
        // Refresh failed - user needs to login again
        console.warn("Token refresh failed, user needs to re-authenticate");
        // Redirect to login or show modal
        const modalSignIn = document.getElementById('modalSignIn');
        if (modalSignIn) {
          modalSignIn.classList.remove('hidden');
          modalSignIn.classList.add('flex');
        }
      }
    }

    return response;
  }

  /**
   * Refreshes the access token using the refresh token
   */
  private static async refreshAccessToken(refreshToken: string): Promise<string | null> {
    try {
      console.log("Attempting to refresh access token...");
      const refreshRes = await fetch(`${BACKEND_URL}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: refreshToken }),
      });

      if (!refreshRes.ok) {
        console.warn(`Token refresh failed with status ${refreshRes.status}`);
        const errorData = await refreshRes.json().catch(() => ({}));
        console.warn("Refresh error details:", errorData);
        
        // Refresh failed, logout user
        AuthManager.clearAuth();
        throw new Error(i18n.t("sessionExpired"));
      }

      const data = await refreshRes.json();
      const newToken = data.newAccessToken;

      if (!newToken) {
        console.error("No access token received from refresh endpoint");
        AuthManager.clearAuth();
        return null;
      }

      console.log("Access token refreshed successfully");
      // Store the new token
      const storage = AuthManager.getStorageType();
      storage.setItem("token", newToken);

      return newToken;
    } catch (error) {
      console.error("Token refresh failed:", error);
      AuthManager.clearAuth();
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

  /**
   * Makes a PATCH request with JSON data
   */
  static async patch(url: string, data: any): Promise<Response> {
    return this.fetchWithAuth(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /**
   * Update user language preference on the backend
   */
  static async updateLanguage(language: string): Promise<boolean> {
    try {
      const response = await this.patch(`${BACKEND_URL}/language`, { language });
      if (response.ok) {
        console.log(`Language preference updated to: ${language}`);
        return true;
      } else {
        console.error('Failed to update language preference:', await response.text());
        return false;
      }
    } catch (error) {
      console.error('Error updating language preference:', error);
      return false;
    }
  }
}
