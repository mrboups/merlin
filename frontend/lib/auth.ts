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
   * Replace the current seed phrase with an imported BIP-39 mnemonic.
   *
   * Requires an active authenticated session (user must already be logged in
   * via passkey). The mnemonic is validated, encrypted with the passkey-derived
   * key held in memory from the most recent login/signup ceremony, stored in
   * IndexedDB, and the re-derived ETH address is sent to the backend.
   *
   * Throws if:
   *  - The user is not authenticated
   *  - The mnemonic is not a valid BIP-39 phrase (12 or 24 words)
   *  - The encryption secret is not available in memory (session expired —
   *    user must log in again to refresh the in-memory key material)
   *
   * @param mnemonic  The 12- or 24-word BIP-39 mnemonic to import
   */
  importSeed: (mnemonic: string) => Promise<void>;
  /**
   * Decrypt and return the current seed phrase.
   *
   * Requires an active authenticated session AND the wallet to be unlocked
   * (i.e. the encryption secret must be held in memory from the most recent
   * login/signup ceremony). This is a sensitive operation — the caller is
   * responsible for zeroing the returned string from memory as soon as the
   * user dismisses the display.
   *
   * Throws if:
   *  - The user is not authenticated
   *  - The encryption secret is not in memory (session expired — re-authenticate)
   *  - No seed blob is found in IndexedDB for this user
   *
   * @returns  The plaintext BIP-39 mnemonic string
   */
  exportSeed: () => Promise<string>;
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
  /**
   * Execute a gasless token swap using EIP-7702 + AmbirePaymaster (USDC gas).
   *
   * The user's EOA pays for gas in USDC — no ETH balance required. Gas is
   * deducted by the paymaster from the user's USDC balance at execution time.
   *
   * On the user's first gasless transaction the EOA must be delegated to
   * AmbireAccount7702 via EIP-7702 — this happens automatically (one-time,
   * transparent to the user) and is reported to the backend as part of the
   * /trade/confirm call.
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
  executeGaslessSwap: (
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
  importSeed: async () => {
    throw new Error("AuthProvider not mounted");
  },
  exportSeed: async () => {
    throw new Error("AuthProvider not mounted");
  },
  executeSwap: async () => {
    throw new Error("AuthProvider not mounted");
  },
  executeGaslessSwap: async () => {
    throw new Error("AuthProvider not mounted");
  },
});

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
