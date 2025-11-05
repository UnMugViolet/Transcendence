// Global type definitions
export interface User {
  id: number;
  name: string;
  profile_picture?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user?: User;
  accessToken: string;
  refreshToken: string;
  error?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface LanguageConfig {
  code: string;
  name: string;
  flag: string;
}

export interface User {
  id: number;
  name: string;
  profile_picture?: string;
}

export type ViewId = "viewGame" | "pongMenu" | "lobby";

export type ModalId = "modalSignUp" | "modalSignIn" | "modalProfile" | "modalFriendProfile" | "modalGamePause" | "modalReconnect";

export type StorageType = typeof localStorage | typeof sessionStorage;
