"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { AuthContext, type AuthUser } from "@/lib/auth";
import { apiClient } from "@/lib/api";
import { API_URL } from "@/lib/constants";
import { createMnemonic, isValidMnemonic, mnemonicToSeed, normaliseMnemonic } from "@/lib/crypto/seed";
import { encrypt, decrypt } from "@/lib/crypto/keystore";
import { deriveEncryptionSecret } from "@/lib/crypto/session-keys";
import { deriveEthKey } from "@/lib/crypto/keys";
import { storeSeed, getSeed } from "@/lib/storage/secure-store";
import { WalletManager } from "@/lib/wallet/wallet-manager";
import {
  executeSwap as executeSwapCore,
  executeGaslessSwap as executeGaslessSwapCore,
  type SwapProgress,
} from "@/lib/wallet/swap";

const STORAGE_KEY = "merlin_auth";

// Module-level singleton — survives re-renders, holds key material in memory.
const walletManager = new WalletManager();

interface StoredAuth {
  userId: string;
  address: string;
  token: string;
}

/**
 * Convert a base64url string (as returned by WebAuthn APIs) to an ArrayBuffer.
 * The credential.rawId is a base64url string when returned by @simplewebauthn/browser.
 */
function base64urlToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletReady, setWalletReady] = useState(false);

  // Encryption secret derived from the WebAuthn credential ID during signup or
  // login. Stored in a ref (memory-only, never written to localStorage or
  // IndexedDB) so that importSeed and exportSeed can use it within the same
  // session without requiring an additional passkey ceremony.
  //
  // This ref is populated in signup (from the registration credential) and in
  // login (from the authentication credential). It is cleared on logout.
  //
  // If the user refreshes the page or the ref is null, importSeed/exportSeed
  // will require the user to log in again — this is intentional and correct.
  const encryptionSecretRef = useRef<string | null>(null);

  // Load stored session on mount and restore wallet state.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data: StoredAuth = JSON.parse(stored);
        setUser({ id: data.userId, address: data.address });
        setToken(data.token);
        setWalletAddress(data.address || null);
        // Address present means wallet was previously derived; mark ready.
        if (data.address) setWalletReady(true);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  // Keep the API client's token getter in sync with auth state.
  useEffect(() => {
    apiClient.setAccessTokenGetter(async () => token);
  }, [token]);

  // Reflect wallet auto-lock in React state.
  useEffect(() => {
    const unsub = walletManager.onLock(() => {
      setWalletReady(false);
    });
    return unsub;
  }, []);

  const saveSession = useCallback(
    (userId: string, address: string, sessionToken: string) => {
      const data: StoredAuth = { userId, address, token: sessionToken };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setUser({ id: userId, address });
      setToken(sessionToken);
      setWalletAddress(address || null);
      if (address) setWalletReady(true);
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Signup — WebAuthn registration + seed generation + key derivation
  // ---------------------------------------------------------------------------

  const signup = useCallback(async () => {
    // Step 1: Fetch registration options from backend.
    // Auto-generate a username — the user identity is the passkey, not a name.
    const username = `user_${Date.now()}`;
    const beginRes = await fetch(`${API_URL}/auth/register/begin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    if (!beginRes.ok) {
      const err = await beginRes.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to start registration");
    }
    const beginData = await beginRes.json();

    // Step 2: Invoke the browser's native passkey creation UI.
    // startRegistration handles the WebAuthn ceremony entirely in the browser.
    // Throws if the user cancels or the platform doesn't support passkeys.
    const credential = await startRegistration({ optionsJSON: beginData.options });

    // Step 3: Send attestation to backend for verification + user creation.
    const completeRes = await fetch(`${API_URL}/auth/register/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: beginData.session_id,
        credential,
        username,
      }),
    });
    if (!completeRes.ok) {
      const err = await completeRes.json().catch(() => ({}));
      throw new Error(err.detail || "Registration failed");
    }
    const completeData = await completeRes.json();
    // completeData: { user_id, token, address }

    // Step 4: Generate BIP-39 mnemonic, encrypt it, and store in IndexedDB.
    // The encryption secret is derived from the credential ID so only this
    // device/passkey can decrypt it (until the user registers a backup passkey).
    const mnemonic = createMnemonic();
    const credentialIdBuffer = base64urlToBuffer(credential.rawId);
    const encryptionSecret = deriveEncryptionSecret(credentialIdBuffer);

    // Hold the secret in memory for the lifetime of this session so that
    // importSeed / exportSeed can operate without requiring a new ceremony.
    encryptionSecretRef.current = encryptionSecret;

    const encryptedBlob = await encrypt(mnemonic, encryptionSecret);
    await storeSeed(completeData.user_id, encryptedBlob);

    // Step 5: Derive the primary ETH address (BIP-44 index 0) from the seed.
    const seed = mnemonicToSeed(mnemonic);
    let address = "";
    try {
      const keypair = deriveEthKey(seed, 0);
      address = keypair.address;
      // Zero the private key — WalletManager isn't unlocked during signup.
      keypair.privateKey.fill(0);
    } finally {
      seed.fill(0);
    }

    // Step 6: Send the derived address to the backend (non-blocking).
    // If this call fails, the address can be recovered by logging in again.
    fetch(`${API_URL}/auth/address`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${completeData.token}`,
      },
      body: JSON.stringify({ address }),
    }).catch((e) => {
      console.warn("[Auth] Failed to sync address to backend:", e);
    });

    // Step 7: Persist session and update React state.
    saveSession(completeData.user_id, address, completeData.token);
  }, [saveSession]);

  // ---------------------------------------------------------------------------
  // Login — WebAuthn authentication + seed decryption + key derivation
  // ---------------------------------------------------------------------------

  const login = useCallback(async () => {
    // Step 1: Fetch authentication options from backend.
    // Uses discoverable credentials — no allow_credentials list sent.
    const beginRes = await fetch(`${API_URL}/auth/login/begin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // LoginBeginRequest body is intentionally empty (discoverable cred flow)
      body: JSON.stringify({}),
    });
    if (!beginRes.ok) {
      const err = await beginRes.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to start login");
    }
    const beginData = await beginRes.json();

    // Step 2: Invoke the browser's native passkey assertion UI.
    const credential = await startAuthentication({ optionsJSON: beginData.options });

    // Step 3: Verify assertion on the backend — updates sign count for replay protection.
    const completeRes = await fetch(`${API_URL}/auth/login/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: beginData.session_id,
        credential,
      }),
    });
    if (!completeRes.ok) {
      const err = await completeRes.json().catch(() => ({}));
      throw new Error(err.detail || "Login failed");
    }
    const completeData = await completeRes.json();
    // completeData: { user_id, token, address }

    // Step 4: Retrieve encrypted seed from IndexedDB and unlock the wallet.
    // address falls back to what the backend has if local decryption fails.
    let address = completeData.address || "";
    const encryptedBlob = await getSeed(completeData.user_id);
    if (encryptedBlob) {
      try {
        const credentialIdBuffer = base64urlToBuffer(credential.rawId);
        const encryptionSecret = deriveEncryptionSecret(credentialIdBuffer);

        // Hold the secret in memory for the lifetime of this session so that
        // importSeed / exportSeed can operate without requiring a new ceremony.
        encryptionSecretRef.current = encryptionSecret;

        const walletState = await walletManager.unlock(encryptedBlob, encryptionSecret);
        address = walletState.address;
        setWalletReady(true);
      } catch (e) {
        // Decryption failure: wrong device, or seed cleared.
        // The user can still access the app but will need to re-import their seed.
        console.warn("[Auth] Failed to unlock wallet from stored seed:", e);
      }
    }

    // Step 5: Persist session and update React state.
    saveSession(completeData.user_id, address, completeData.token);
  }, [saveSession]);

  // ---------------------------------------------------------------------------
  // Logout — clear all state and key material
  // ---------------------------------------------------------------------------

  const logout = useCallback(async () => {
    // Zero and clear the private key from memory first.
    walletManager.lock();

    // Clear the in-memory encryption secret — it must not outlive the session.
    encryptionSecretRef.current = null;

    // Clear persisted session.
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setToken(null);
    setWalletAddress(null);
    setWalletReady(false);

    // Notify backend (JWT is stateless so this is informational only).
    if (token) {
      fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    window.location.href = "/";
  }, [token]);

  const getAccessToken = useCallback(async () => {
    return token;
  }, [token]);

  // ---------------------------------------------------------------------------
  // importSeed — replace stored seed with a user-supplied BIP-39 mnemonic
  // ---------------------------------------------------------------------------

  const importSeed = useCallback(async (mnemonic: string) => {
    if (!user) {
      throw new Error("Must be authenticated to import a seed phrase");
    }

    // Normalise first so validation isn't tripped up by extra whitespace.
    const normalised = normaliseMnemonic(mnemonic);

    if (!isValidMnemonic(normalised)) {
      throw new Error("Invalid seed phrase — check your words and try again");
    }

    // The encryption secret must be in memory from the most recent login or
    // signup ceremony. If it is null the user has refreshed the page without
    // logging in again (the passkey assertion is needed to re-derive it).
    const encryptionSecret = encryptionSecretRef.current;
    if (!encryptionSecret) {
      throw new Error(
        "Session key not available — please log out and log in again before importing a seed phrase"
      );
    }

    // Encrypt the imported seed with the same key that protects the current
    // seed. storeSeed uses put semantics — any existing blob is overwritten.
    const encryptedBlob = await encrypt(normalised, encryptionSecret);
    await storeSeed(user.id, encryptedBlob);

    // Derive the new primary ETH address from the imported seed.
    const seed = mnemonicToSeed(normalised);
    let newAddress = "";
    try {
      const keypair = deriveEthKey(seed, 0);
      newAddress = keypair.address;
      // The private key is only needed for address derivation here.
      // Zero it — the wallet will be fully unlocked on the next login.
      keypair.privateKey.fill(0);
    } finally {
      seed.fill(0);
    }

    // Persist the new address to the backend (non-blocking — recoverable on
    // next login if the call fails).
    fetch(`${API_URL}/auth/address`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ address: newAddress }),
    }).catch((e) => {
      console.warn("[Auth] Failed to sync imported address to backend:", e);
    });

    // Update local session with the new address.
    saveSession(user.id, newAddress, token ?? "");

    // Re-unlock the wallet with the imported seed so the private key is
    // immediately available for transactions without requiring a re-login.
    try {
      await walletManager.unlock(encryptedBlob, encryptionSecret);
      setWalletReady(true);
    } catch (e) {
      // Non-fatal — the wallet will unlock correctly on next login.
      console.warn("[Auth] Failed to re-unlock wallet after seed import:", e);
    }
  }, [user, token, saveSession]);

  // ---------------------------------------------------------------------------
  // exportSeed — decrypt and return the stored BIP-39 mnemonic
  // ---------------------------------------------------------------------------

  const exportSeed = useCallback(async (): Promise<string> => {
    if (!user) {
      throw new Error("Must be authenticated to export the seed phrase");
    }

    // The encryption secret must be present in memory. If it is null the user
    // has a page session but has not re-authenticated since the last refresh.
    const encryptionSecret = encryptionSecretRef.current;
    if (!encryptionSecret) {
      throw new Error(
        "Session key not available — please log out and log in again before exporting your seed phrase"
      );
    }

    const blob = await getSeed(user.id);
    if (!blob) {
      throw new Error("No seed phrase stored for this account");
    }

    // decrypt() will throw "keystore: incorrect password" if the secret is wrong.
    const mnemonic = await decrypt(blob, encryptionSecret);
    return mnemonic;
  }, [user]);

  // ---------------------------------------------------------------------------
  // executeSwap — sign and broadcast a swap using the in-memory private key
  // ---------------------------------------------------------------------------

  const executeSwap = useCallback(
    async (
      tokenIn: string,
      tokenOut: string,
      amount: number,
      amountType: "usd" | "quantity",
      onProgress: (progress: SwapProgress) => void,
      slippage: number = 0.5
    ): Promise<{ txHash: string; success: boolean }> => {
      const privateKey = walletManager.getPrivateKey();
      if (!privateKey) {
        throw new Error(
          "Wallet is locked — please re-authenticate before trading"
        );
      }
      return executeSwapCore(
        tokenIn,
        tokenOut,
        amount,
        amountType,
        privateKey,
        onProgress,
        slippage
      );
    },
    [] // walletManager is a stable module-level singleton
  );

  // ---------------------------------------------------------------------------
  // executeGaslessSwap — gasless swap via EIP-7702 + AmbirePaymaster (USDC gas)
  // ---------------------------------------------------------------------------

  const executeGaslessSwap = useCallback(
    async (
      tokenIn: string,
      tokenOut: string,
      amount: number,
      amountType: "usd" | "quantity",
      onProgress: (progress: SwapProgress) => void,
      slippage: number = 0.5
    ): Promise<{ txHash: string; success: boolean }> => {
      const privateKey = walletManager.getPrivateKey();
      if (!privateKey) {
        throw new Error(
          "Wallet is locked — please re-authenticate before trading"
        );
      }
      return executeGaslessSwapCore(
        tokenIn,
        tokenOut,
        amount,
        amountType,
        privateKey,
        onProgress,
        slippage
      );
    },
    [] // walletManager is a stable module-level singleton
  );

  return (
    <AuthContext.Provider
      value={{
        ready,
        authenticated: !!user,
        user,
        walletAddress,
        walletReady,
        login,
        signup,
        logout,
        getAccessToken,
        importSeed,
        exportSeed,
        executeSwap,
        executeGaslessSwap,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
