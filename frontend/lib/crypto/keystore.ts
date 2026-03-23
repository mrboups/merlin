/**
 * Keystore encryption/decryption using Scrypt + AES-128-CTR.
 *
 * Compatible with Ambire's keystore pattern:
 *   - Scrypt KDF (N=131072, r=8, p=1) for key derivation
 *   - AES-128-CTR for encryption (first 16 bytes of derived key)
 *   - keccak256 MAC for integrity verification (bytes 16-32 of derived key as prefix)
 *
 * The MAC prevents silent decryption with a wrong password — if the MAC
 * does not match, we throw before ever touching the ciphertext.
 *
 * Dependencies (must be installed): @noble/hashes, @noble/ciphers
 */

import { scrypt } from "@noble/hashes/scrypt.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { ctr } from "@noble/ciphers/aes.js";
import { keccak_256 as _keccak256 } from "@noble/hashes/sha3.js";

// ---------------------------------------------------------------------------
// Scrypt parameters — must match Ambire's scryptDefaults exactly
// ---------------------------------------------------------------------------
const SCRYPT_N = 131072; // Cost factor
const SCRYPT_R = 8;      // Block size
const SCRYPT_P = 1;      // Parallelisation
const DERIVED_KEY_LEN = 32; // 16 bytes for AES key + 16 bytes for MAC prefix

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EncryptedBlob {
  version: 1;
  kdf: "scrypt";
  kdfParams: {
    n: number;
    r: number;
    p: number;
    dkLen: number;
    salt: string; // hex-encoded
  };
  cipher: "aes-128-ctr";
  cipherParams: {
    iv: string; // hex-encoded
  };
  ciphertext: string; // hex-encoded
  mac: string;        // hex-encoded keccak256 integrity tag
}

// ---------------------------------------------------------------------------
// Hex utilities
// ---------------------------------------------------------------------------

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("keystore: invalid hex string (odd length)");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// keccak256 wrapper (thin alias over @noble/hashes/sha3 keccak_256)
// ---------------------------------------------------------------------------

function keccak256(data: Uint8Array): Uint8Array {
  return _keccak256(data);
}

// ---------------------------------------------------------------------------
// Key derivation helper
// ---------------------------------------------------------------------------

interface DerivedParts {
  aesKey: Uint8Array;    // bytes 0–15 → AES-128 key
  macPrefix: Uint8Array; // bytes 16–31 → prepended before keccak256 MAC
}

/**
 * NOTE: @noble/hashes/scrypt is synchronous and CPU-intensive at N=131072.
 * It will block the JS main thread for ~1-3 seconds on a typical device.
 * The calling functions (encrypt / decrypt) are marked async so they can be
 * awaited by callers, but the blocking happens synchronously inside this call.
 *
 * For a production UI, wrap encrypt/decrypt calls in a Web Worker to avoid
 * freezing the React render loop. Ambire's Gecko-browser path does the same.
 */
function deriveKey(password: string, salt: Uint8Array, n: number, r: number, p: number): DerivedParts {
  const passwordBytes = new TextEncoder().encode(password);
  const derived = scrypt(passwordBytes, salt, { N: n, r, p, dkLen: DERIVED_KEY_LEN });
  return {
    aesKey: derived.slice(0, 16),
    macPrefix: derived.slice(16, 32),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext string (typically a mnemonic) with a password.
 *
 * The password is typically the hex-encoded output of `deriveEncryptionSecret`
 * from session-keys.ts — a high-entropy string derived from the passkey
 * credential ID.
 *
 * Returns an EncryptedBlob that can be safely stored in IndexedDB or
 * serialised to JSON.
 */
export async function encrypt(plaintext: string, password: string): Promise<EncryptedBlob> {
  const salt = randomBytes(32);
  const iv = randomBytes(16);

  const { aesKey, macPrefix } = deriveKey(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);

  // AES-128-CTR encryption
  const stream = ctr(aesKey, iv);
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = stream.encrypt(data);

  // MAC: keccak256(macPrefix || ciphertext) — authenticates the ciphertext
  const macInput = new Uint8Array(macPrefix.length + ciphertext.length);
  macInput.set(macPrefix, 0);
  macInput.set(ciphertext, macPrefix.length);
  const mac = keccak256(macInput);

  return {
    version: 1,
    kdf: "scrypt",
    kdfParams: {
      n: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      dkLen: DERIVED_KEY_LEN,
      salt: toHex(salt),
    },
    cipher: "aes-128-ctr",
    cipherParams: {
      iv: toHex(iv),
    },
    ciphertext: toHex(ciphertext),
    mac: toHex(mac),
  };
}

/**
 * Decrypt an EncryptedBlob with the correct password.
 *
 * Throws if:
 *  - The MAC does not match (wrong password, or tampered ciphertext)
 *  - The blob format is invalid
 *
 * Returns the original plaintext string.
 */
export async function decrypt(blob: EncryptedBlob, password: string): Promise<string> {
  if (blob.version !== 1) {
    throw new Error(`keystore: unsupported blob version ${blob.version}`);
  }

  const salt = fromHex(blob.kdfParams.salt);
  const iv = fromHex(blob.cipherParams.iv);
  const ciphertextBytes = fromHex(blob.ciphertext);
  const expectedMac = fromHex(blob.mac);

  const { aesKey, macPrefix } = deriveKey(
    password,
    salt,
    blob.kdfParams.n,
    blob.kdfParams.r,
    blob.kdfParams.p
  );

  // Verify MAC before decryption — reject wrong passwords immediately
  const macInput = new Uint8Array(macPrefix.length + ciphertextBytes.length);
  macInput.set(macPrefix, 0);
  macInput.set(ciphertextBytes, macPrefix.length);
  const mac = keccak256(macInput);

  if (mac.length !== expectedMac.length) {
    throw new Error("keystore: incorrect password or corrupted blob");
  }
  for (let i = 0; i < mac.length; i++) {
    if (mac[i] !== expectedMac[i]) {
      throw new Error("keystore: incorrect password or corrupted blob");
    }
  }

  // AES-128-CTR decryption
  const stream = ctr(aesKey, iv);
  const decrypted = stream.decrypt(ciphertextBytes);

  return new TextDecoder().decode(decrypted);
}
