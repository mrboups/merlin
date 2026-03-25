/**
 * WalletManager — manages the Merlin wallet session lifecycle.
 *
 * Responsibilities:
 *   - Unlock: decrypt encrypted seed blob → derive ETH keys → hold in memory
 *   - Lock: zero-fill and clear all key material from memory
 *   - Auto-lock: inactivity timer that locks the wallet automatically
 *   - Key access: provide the private key to signing operations
 *
 * Security model:
 *   - Private key material lives ONLY in this class, in memory
 *   - It is never written to storage, localStorage, or IndexedDB
 *   - On lock, the Uint8Array is zeroed before the reference is dropped
 *     (best-effort — the GC may still hold copies, but we erase what we can)
 *   - Auto-lock fires after AUTO_LOCK_MS of inactivity (default: 15 minutes)
 *
 * This class is intentionally framework-agnostic (no React, no Zustand).
 * Integrate with Zustand by calling wallet.onLock() and reflecting state
 * changes in your store.
 *
 * Usage:
 *   const wallet = new WalletManager();
 *   wallet.onLock(() => store.setState({ isUnlocked: false }));
 *
 *   const blob = await getSeed(userId);
 *   const password = deriveEncryptionSecret(credentialId);
 *   const { address } = await wallet.unlock(blob, password);
 *
 *   // Later — sign a transaction:
 *   const privKey = wallet.getPrivateKey();
 *
 *   // Explicit lock:
 *   wallet.lock();
 */

import { decrypt, type EncryptedBlob } from "../crypto/keystore";
import { mnemonicToSeed } from "../crypto/seed";
import { deriveEthKey, type EthKeyPair } from "../crypto/keys";
import { deriveRailgunKeys } from "../privacy/railgun-keys";
import type { RailgunKeys } from "../privacy/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Inactivity period after which the wallet auto-locks (milliseconds). */
const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Public-safe wallet state — excludes key material. */
export interface WalletState {
  /** EIP-55 checksummed Ethereum address */
  address: string;
  /** Compressed secp256k1 public key (33 bytes) */
  publicKey: Uint8Array;
  /** BIP-44 derivation path used for this account */
  path: string;
}

// ---------------------------------------------------------------------------
// WalletManager
// ---------------------------------------------------------------------------

export class WalletManager {
  // ---------------------------------------------------------------------------
  // Private state — key material
  // ---------------------------------------------------------------------------
  #privateKey: Uint8Array | null = null;
  #publicKey: Uint8Array | null = null;
  #address: string | null = null;
  #path: string | null = null;
  #railgunKeys: RailgunKeys | null = null;

  // ---------------------------------------------------------------------------
  // Auto-lock timer
  // ---------------------------------------------------------------------------
  #autoLockTimer: ReturnType<typeof setTimeout> | null = null;

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------
  #onLockCallbacks: Array<() => void> = [];

  // ---------------------------------------------------------------------------
  // Public: lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Unlock the wallet.
   *
   * Decrypts the stored seed blob with the given password, derives the ETH
   * key at the specified BIP-44 index, and holds it in memory.
   *
   * The binary seed is zeroed immediately after key derivation — only the
   * derived keypair is retained.
   *
   * @param encryptedBlob  The EncryptedBlob from secure-store.getSeed()
   * @param password       The hex password from deriveEncryptionSecret()
   * @param index          BIP-44 account index (default 0)
   * @throws               If the password is wrong or the blob is corrupted
   */
  async unlock(
    encryptedBlob: EncryptedBlob,
    password: string,
    index: number = 0
  ): Promise<WalletState> {
    // Decrypt mnemonic (throws on bad password via MAC check)
    const mnemonic = await decrypt(encryptedBlob, password);

    // Derive the 64-byte BIP-39 seed
    const seed = mnemonicToSeed(mnemonic);

    let keypair: EthKeyPair;
    try {
      keypair = deriveEthKey(seed, index);
    } finally {
      // Zero the seed bytes immediately — only the derived keys are kept
      seed.fill(0);
    }

    // Store key material in memory
    this.#privateKey = keypair.privateKey;
    this.#publicKey = keypair.publicKey;
    this.#address = keypair.address;
    this.#path = keypair.path;

    // Derive Railgun privacy keys (BabyJubJub + Ed25519)
    // This runs asynchronously but we await it before returning
    try {
      this.#railgunKeys = await deriveRailgunKeys(mnemonic, index);
    } catch {
      // Privacy keys are non-critical — wallet still works without them.
      // The error will surface when the user tries to use privacy features.
      this.#railgunKeys = null;
    }

    // Start / reset the auto-lock timer
    this.#resetAutoLock();

    return {
      address: keypair.address,
      publicKey: keypair.publicKey,
      path: keypair.path,
    };
  }

  /**
   * Lock the wallet.
   *
   * Zeros the private key bytes and clears all key material from memory.
   * All registered onLock callbacks are invoked synchronously.
   */
  lock(): void {
    if (this.#privateKey) {
      this.#privateKey.fill(0);
    }

    // Zero Railgun key material
    if (this.#railgunKeys) {
      this.#railgunKeys.spending.privateKey.fill(0);
      this.#railgunKeys.viewing.privateKey.fill(0);
      this.#railgunKeys = null;
    }

    this.#privateKey = null;
    this.#publicKey = null;
    this.#address = null;
    this.#path = null;

    this.#clearAutoLock();
    this.#notifyLock();
  }

  // ---------------------------------------------------------------------------
  // Public: state queries
  // ---------------------------------------------------------------------------

  /** True if the wallet is currently unlocked and key material is in memory. */
  isUnlocked(): boolean {
    return this.#privateKey !== null;
  }

  /**
   * Return the current wallet address, or null if locked.
   * Does NOT reset the auto-lock timer — reading the address is not "activity".
   */
  getAddress(): string | null {
    return this.#address;
  }

  /**
   * Return the current wallet state (address, public key, path), or null if locked.
   */
  getState(): WalletState | null {
    if (this.#privateKey === null || this.#publicKey === null || this.#address === null || this.#path === null) {
      return null;
    }
    return {
      address: this.#address,
      publicKey: this.#publicKey,
      path: this.#path,
    };
  }

  // ---------------------------------------------------------------------------
  // Public: key access (only for signing operations)
  // ---------------------------------------------------------------------------

  /**
   * Return the raw private key bytes for signing, or null if locked.
   *
   * This method resets the auto-lock timer — accessing the key counts as
   * wallet activity.
   *
   * IMPORTANT: The caller must NEVER store the returned reference beyond the
   * immediate signing operation. Do not assign it to a variable that persists
   * across async boundaries. The WalletManager remains the sole owner.
   */
  getPrivateKey(): Uint8Array | null {
    if (this.#privateKey === null) return null;
    this.#resetAutoLock();
    return this.#privateKey;
  }

  // ---------------------------------------------------------------------------
  // Public: callbacks
  // ---------------------------------------------------------------------------

  /**
   * Register a callback that fires whenever the wallet locks (auto-lock or
   * explicit lock). Use this to update UI state and Zustand stores.
   *
   * Multiple callbacks can be registered — all are called in registration order.
   *
   * Returns an unsubscribe function.
   */
  onLock(callback: () => void): () => void {
    this.#onLockCallbacks.push(callback);
    return () => {
      this.#onLockCallbacks = this.#onLockCallbacks.filter((cb) => cb !== callback);
    };
  }

  // ---------------------------------------------------------------------------
  // Public: Railgun privacy key access
  // ---------------------------------------------------------------------------

  /**
   * Return the Railgun 0zk address, or null if locked or keys unavailable.
   */
  getRailgunAddress(): string | null {
    return this.#railgunKeys?.address ?? null;
  }

  /**
   * Return the full Railgun key set, or null if locked or keys unavailable.
   *
   * This method resets the auto-lock timer — accessing keys counts as activity.
   *
   * IMPORTANT: The caller must NEVER store the returned reference beyond the
   * immediate operation. The WalletManager remains the sole owner.
   */
  getRailgunKeys(): RailgunKeys | null {
    if (!this.#railgunKeys) return null;
    this.#resetAutoLock();
    return this.#railgunKeys;
  }

  // ---------------------------------------------------------------------------
  // Public: auto-lock management
  // ---------------------------------------------------------------------------

  /**
   * Manually reset the auto-lock timer.
   *
   * Call this from UI event handlers to signal user activity when no key
   * access is occurring (e.g. navigating between screens).
   */
  resetActivityTimer(): void {
    if (this.isUnlocked()) {
      this.#resetAutoLock();
    }
  }

  // ---------------------------------------------------------------------------
  // Private: timer management
  // ---------------------------------------------------------------------------

  #resetAutoLock(): void {
    this.#clearAutoLock();
    this.#autoLockTimer = setTimeout(() => {
      this.lock();
    }, AUTO_LOCK_MS);
  }

  #clearAutoLock(): void {
    if (this.#autoLockTimer !== null) {
      clearTimeout(this.#autoLockTimer);
      this.#autoLockTimer = null;
    }
  }

  #notifyLock(): void {
    for (const cb of this.#onLockCallbacks) {
      try {
        cb();
      } catch {
        // Callbacks must not crash the lock sequence
      }
    }
  }
}
