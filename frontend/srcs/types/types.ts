// Global type definitions
export interface User {
  id: number;
  name: string;
  profile_picture?: string;
  role?: Role;
}

export interface Role {
  id: number;
  name: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user?: User;
  role: Role;
  accessToken: string;
  refreshToken: string;
  error?: string;
}

export interface TwoFAChallengeResponse {
  requiresTwoFA: true;
  userId: number;
  tempToken: string;
}

export type LoginResponse = AuthResponse | TwoFAChallengeResponse;

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

export interface UserStats {
  totalGames: number;
  wins: number;
  losses: number;
  avgScore: number;
  winRate: number; // percentage
}

export type ViewId = "viewGame" | "pongMenu" | "lobby" | "userDashboard";

export type ModalId = "modalSignUp" | "modalSignIn" | "modalProfile" | "modalFriendProfile" | "modalGamePause" | "modalReconnect";

export type StorageType = typeof localStorage | typeof sessionStorage;
