"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { AuthContext, type AuthUser } from "@/lib/auth";
import { apiClient } from "@/lib/api";
import { API_URL } from "@/lib/constants";
import { createMnemonic, mnemonicToSeed } from "@/lib/crypto/seed";
import { encrypt } from "@/lib/crypto/keystore";
import { deriveEncryptionSecret } from "@/lib/crypto/session-keys";
import { deriveEthKey } from "@/lib/crypto/keys";
import { storeSeed, getSeed } from "@/lib/storage/secure-store";
import { WalletManager } from "@/lib/wallet/wallet-manager";

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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
