/**
 * IndexedDB-based secure storage for encrypted seed blobs.
 *
 * This module only handles storage. Encryption is handled upstream by
 * lib/crypto/keystore.ts — what arrives here is already an opaque
 * EncryptedBlob that cannot be decrypted without the correct password.
 *
 * Schema:
 *   Database:  merlin-keystore (version 1)
 *   Store:     seeds  (keyPath: userId)
 *   Record:    { userId, blob, createdAt }
 *
 * All operations are async and return Promises. The database is opened
 * fresh on every call and closed immediately after — this avoids holding
 * a long-lived IDBDatabase reference across page navigations.
 */

import type { EncryptedBlob } from "../crypto/keystore";

const DB_NAME = "merlin-keystore";
const DB_VERSION = 1;
const STORE_NAME = "seeds";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredSeed {
  userId: string;
  blob: EncryptedBlob;
  createdAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Internal: database lifecycle
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`secure-store: failed to open IndexedDB — ${request.error?.message}`));
    request.onblocked = () => reject(new Error("secure-store: IndexedDB upgrade blocked by open connection"));
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store an encrypted seed blob for a user.
 *
 * If a blob already exists for this userId it is overwritten (put semantics).
 * This handles the case where a user re-creates their passkey or imports a
 * different seed phrase.
 */
export async function storeSeed(userId: string, blob: EncryptedBlob): Promise<void> {
  const db = await openDB();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const record: StoredSeed = {
      userId,
      blob,
      createdAt: new Date().toISOString(),
    };

    store.put(record);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new Error(`secure-store: write failed — ${tx.error?.message}`));
    };
    tx.onabort = () => {
      db.close();
      reject(new Error("secure-store: write transaction aborted"));
    };
  });
}

/**
 * Retrieve the encrypted seed blob for a user.
 *
 * Returns null if no seed has been stored for this userId (i.e. new user
 * who hasn't completed onboarding, or storage was cleared).
 */
export async function getSeed(userId: string): Promise<EncryptedBlob | null> {
  const db = await openDB();

  return new Promise<EncryptedBlob | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(userId);

    request.onsuccess = () => {
      db.close();
      const record = request.result as StoredSeed | undefined;
      resolve(record?.blob ?? null);
    };
    request.onerror = () => {
      db.close();
      reject(new Error(`secure-store: read failed — ${request.error?.message}`));
    };
  });
}

/**
 * Delete the stored seed for a user.
 *
 * Used during account deletion or when a user explicitly clears their wallet.
 * No-op if no seed exists for this userId.
 */
export async function deleteSeed(userId: string): Promise<void> {
  const db = await openDB();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(userId);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new Error(`secure-store: delete failed — ${tx.error?.message}`));
    };
  });
}

/**
 * Check if a seed has been stored for a user.
 *
 * Used on app startup to decide whether to show the onboarding flow or
 * the unlock screen.
 */
export async function hasSeed(userId: string): Promise<boolean> {
  const blob = await getSeed(userId);
  return blob !== null;
}

/**
 * List all stored user IDs.
 *
 * Useful for multi-account support and device management screens.
 */
export async function listUserIds(): Promise<string[]> {
  const db = await openDB();

  return new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAllKeys();

    request.onsuccess = () => {
      db.close();
      resolve(request.result as string[]);
    };
    request.onerror = () => {
      db.close();
      reject(new Error(`secure-store: key enumeration failed — ${request.error?.message}`));
    };
  });
}
