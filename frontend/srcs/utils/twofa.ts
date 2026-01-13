import { BACKEND_URL } from "./config.js";
import { ApiClient } from "./api.js";
import { ModalManager } from "./modal.js";

/**
 * Two-Factor Authentication manager
 */
export class TwoFactorAuthManager {
  private static currentUserId: number | null = null;
  private static currentTempToken: string | null = null;
  private static setupAccessToken: string | null = null;
  private static setupResolve: ((verified: boolean) => void) | null = null;
  private static setupEnforced: boolean = false;
  private static codeResolve: ((code: string | null) => void) | null = null;
  private static stayConnected: boolean = false;
  private static onComplete: (() => void) | null = null;

  /**
   * Initialize 2FA setup modal with QR code and backup codes
   */
  static async showSetupModal(
    accessToken: string,
    stayConnected: boolean,
    onComplete: () => void,
    options?: { enforced?: boolean }
  ): Promise<boolean> {
    this.stayConnected = stayConnected;
    this.onComplete = onComplete;
    this.setupAccessToken = accessToken;
    this.setupEnforced = Boolean(options?.enforced);

    try {
      // Call backend to enable 2FA and get QR code
      const response = await fetch(`${BACKEND_URL}/2fa/enable`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        console.error('2FA enable failed:', errorMsg);
        throw new Error(`Failed to initialize 2FA: ${errorMsg}`);
      }

      const data = await response.json();
      
      // Display QR code
      const qrCodeContainer = document.getElementById('qrCodeContainer');
      if (qrCodeContainer) {
        qrCodeContainer.innerHTML = `<img src="${data.qrCode}" alt="QR Code" class="w-64 h-64" />`;
      }

      // Display manual secret
      const manualSecret = document.getElementById('manualSecret');
      if (manualSecret) {
        manualSecret.textContent = data.secret;
      }

      // Display backup codes
      const backupCodesList = document.getElementById('backupCodesList');
      if (backupCodesList && data.backupCodes) {
        backupCodesList.innerHTML = data.backupCodes
          .map((code: string) => `<div class="text-center">${code}</div>`)
          .join('');
      }

      // Show the modal
      const modal = document.getElementById('modal2FASetup') as HTMLElement;
      const modalProfile = document.getElementById('modalProfile') as HTMLElement;
      
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modalProfile.classList.add('hidden');
        modalProfile.classList.remove('flex');
      }

      // Focus on the input
      const input = document.getElementById('input2FACode') as HTMLInputElement;
      if (input) {
        setTimeout(() => input.focus(), 100);
      }

      return await new Promise<boolean>((resolve) => {
        this.setupResolve = resolve;
      });
    } catch (error) {
      console.error('Error setting up 2FA:', error);
      throw error;
    }
  }

  /**
   * Verify 2FA code during setup
   */
  static async verifySetupCode(accessToken: string, code: string): Promise<boolean> {
    try {
      const response = await fetch(`${BACKEND_URL}/2fa/verify-enable`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: code })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Invalid code');
      }

      return true;
    } catch (error) {
      console.error('Error verifying 2FA code:', error);
      throw error;
    }
  }

  /**
   * Show 2FA login verification modal
   */
  static showLoginModal(tempToken: string, stayConnected: boolean, onSuccess: (code: string) => void): void {
    this.currentTempToken = tempToken;
    this.stayConnected = stayConnected;

    const modal = document.getElementById('modal2FALogin');
    const editModal = document.getElementById('modalProfile') as HTMLElement;

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
    // hide the edit profile modal if 
    if (editModal) {
      editModal.classList.remove('fixed');
      editModal.classList.add('hidden');
    }

    // Store callback for when verification succeeds
    (window as any).__2faLoginCallback = onSuccess;

    // Focus on the input
    const input = document.getElementById('input2FALoginCode') as HTMLInputElement;
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 100);
    }
  }

  /**
   * Ask the user for a 2FA code (TOTP or backup code) using the existing login modal.
   * Resolves with the code, or null if the user cancels.
   */
  static async requestCode(): Promise<string | null> {
    const modal = document.getElementById('modal2FALogin');
    if (!modal) return null;

    // Clear any previous error message
    const msgEl = document.getElementById('message2FALogin');
    if (msgEl) msgEl.textContent = '';

    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const input = document.getElementById('input2FALoginCode') as HTMLInputElement;
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 100);
    }

    return await new Promise<string | null>((resolve) => {
      this.codeResolve = resolve;
    });
  }

  /**
   * Close 2FA setup modal
   */
  static closeSetupModal(): void {
    const modal = document.getElementById('modal2FASetup');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  /**
   * Close 2FA login modal
   */
  static closeLoginModal(): void {
    const modal = document.getElementById('modal2FALogin');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  /**
   * Setup event listeners for 2FA modals
   */
  static setupEventListeners(): void {
    // Setup form verification
    const form2FAVerify = document.getElementById('form2FAVerify') as HTMLFormElement;
    form2FAVerify?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const input = document.getElementById('input2FACode') as HTMLInputElement;
      const messageEl = document.getElementById('message2FA');
      const code = input.value.trim();

      if (code.length !== 6) {
        if (messageEl) messageEl.textContent = 'Please enter a 6-digit code';
        return;
      }

      try {
        const accessToken = this.setupAccessToken || sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!accessToken) throw new Error('No access token found');

        await this.verifySetupCode(accessToken, code);
        
        if (messageEl) messageEl.textContent = '';
        this.closeSetupModal();

        if (this.setupResolve) {
          this.setupResolve(true);
          this.setupResolve = null;
        }
        this.setupAccessToken = null;
        this.setupEnforced = false;
        
        // Call completion callback
        if (this.onComplete) {
          this.onComplete();
        }
      } catch (error: any) {
        if (messageEl) messageEl.textContent = `❌ ${error.message}`;
      }
    });

    // Skip 2FA button
    const skip2FA = document.getElementById('skip2FA');
    skip2FA?.addEventListener('click', () => {
      if (this.setupEnforced) {
        const TwoFAModal = document.getElementById('modal2FASetup') as HTMLElement;
        const modalSignup = document.getElementById('id="modalSignUp"') as HTMLElement;

        if (TwoFAModal) {
          TwoFAModal.classList.remove('flex');
          TwoFAModal.classList.add('hidden');
        }
        if (modalSignup) {
          modalSignup.classList.remove('hidden');
          modalSignup.classList.add('flex');
        }
        
        return;
      }

      this.closeSetupModal();

      if (this.setupResolve) {
        this.setupResolve(false);
        this.setupResolve = null;
      }
      this.setupAccessToken = null;
      this.setupEnforced = false;

      if (this.onComplete) this.onComplete();
    });

    // Copy backup codes
    const copyBackupCodes = document.getElementById('copyBackupCodes');
    copyBackupCodes?.addEventListener('click', () => {
      const backupCodesList = document.getElementById('backupCodesList');
      if (backupCodesList) {
        const codes = Array.from(backupCodesList.children)
          .map(el => el.textContent)
          .join('\n');
        
        navigator.clipboard.writeText(codes).then(() => {
          const btn = copyBackupCodes as HTMLButtonElement;
          const originalText = btn.textContent;
          btn.textContent = '✓ Copied!';
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
        });
      }
    });

    // 2FA Login form
    const form2FALogin = document.getElementById('form2FALogin') as HTMLFormElement;
    form2FALogin?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const input = document.getElementById('input2FALoginCode') as HTMLInputElement;
      const messageEl = document.getElementById('message2FALogin');
      const code = input.value.trim();

      if (code.length !== 6 && code.length !== 8) {
        if (messageEl) messageEl.textContent = 'Please enter a 6-digit code or 8-character backup code';
        return;
      }

      // Call the stored callback
      const callback = (window as any).__2faLoginCallback;
      if (callback) {
        callback(code);
      }

      if (this.codeResolve) {
        const resolve = this.codeResolve;
        this.codeResolve = null;
        this.closeLoginModal();
        resolve(code);
      }
    });

    // Cancel 2FA login
    const cancel2FALogin = document.getElementById('cancel2FALogin');
    cancel2FALogin?.addEventListener('click', () => {
      this.closeLoginModal();
      delete (window as any).__2faLoginCallback;

      if (this.codeResolve) {
        const resolve = this.codeResolve;
        this.codeResolve = null;
        resolve(null);
      }
    });

    // Auto-format 2FA input (digits only)
    const input2FACode = document.getElementById('input2FACode') as HTMLInputElement;
    input2FACode?.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
    });

    const input2FALoginCode = document.getElementById('input2FALoginCode') as HTMLInputElement;
    input2FALoginCode?.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      // Allow both 6-digit codes and 8-character backup codes
      if (input.value.length <= 6) {
        input.value = input.value.replace(/\D/g, '').slice(0, 6);
      } else {
        input.value = input.value.toUpperCase().slice(0, 8);
      }
    });
  }
}
