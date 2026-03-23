"use client";

import { createContext, useContext } from "react";
import type { SwapProgress } from "./wallet/swap";

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
  /**
   * Execute a token swap using the wallet's private key.
   *
   * The wallet must be unlocked (walletReady === true) before calling this.
   * Throws with "Wallet is locked" if called when the wallet is not unlocked.
   *
   * @param tokenIn      Symbol or address of the token to sell
   * @param tokenOut     Symbol or address of the token to buy
   * @param amount       Amount to trade
   * @param amountType   Whether amount is a USD value or token quantity
   * @param onProgress   Callback invoked at each stage of the swap lifecycle
   * @param slippage     Max acceptable slippage percentage (default: 0.5)
   */
  executeSwap: (
    tokenIn: string,
    tokenOut: string,
    amount: number,
    amountType: "usd" | "quantity",
    onProgress: (progress: SwapProgress) => void,
    slippage?: number
  ) => Promise<{ txHash: string; success: boolean }>;
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
  executeSwap: async () => {
    throw new Error("AuthProvider not mounted");
  },
});

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
