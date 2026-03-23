"use client";

import { createContext, useContext } from "react";

export interface AuthUser {
  id: string;
  address: string;
}

export interface AuthContextType {
  ready: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  walletAddress: string | null;
  walletReady: boolean;
  login: () => Promise<void>;
  signup: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

export const AuthContext = createContext<AuthContextType>({
  ready: false,
  authenticated: false,
  user: null,
  walletAddress: null,
  walletReady: false,
  login: async () => {},
  signup: async () => {},
  logout: async () => {},
  getAccessToken: async () => null,
});

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
