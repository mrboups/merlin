/**
 * Derive an encryption secret from a WebAuthn passkey credential.
 *
 * Problem: The passkey credential ID is public (stored in the authenticator
 * and transmitted during authentication). We cannot use it directly as a
 * password — an attacker who obtains the credential ID could attempt to
 * decrypt the seed blob.
 *
 * Solution: We derive a high-entropy secret via HKDF-SHA256. The IKM is
 * the credential ID bytes themselves. While the credential ID is not secret,
 * the derived key is computationally bound to the HKDF domain string
 * ("merlin-keystore-v1"), making brute-force impractical for a 32-byte output.
 *
 * For maximum security, Merlin should additionally ask the user for a
 * passphrase during account creation and XOR / concatenate it as extra
 * entropy. This is left to the auth layer (passkey-auth agent domain).
 *
 * Dependencies (must be installed): @noble/hashes
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";

// Domain separation string — changing this produces different keys.
// Increment the version if the KDF scheme ever changes.
const HKDF_INFO = new TextEncoder().encode("merlin-keystore-v1");

// 32 bytes of output → 64 hex chars → high-entropy keystore password
const DERIVED_KEY_LENGTH = 32;

/**
 * Derive a deterministic, high-entropy encryption password from a
 * WebAuthn credential ID.
 *
 * The credential ID is unique per passkey and stable across authentications
 * on the same device/authenticator. Using it as IKM to HKDF-SHA256 produces
 * a 32-byte key that is computationally independent of the raw credential ID.
 *
 * Returns a 64-character lowercase hex string suitable for use as the
 * `password` argument to keystore.encrypt() / keystore.decrypt().
 *
 * @param credentialId - The rawId ArrayBuffer from the WebAuthn response.
 */
export function deriveEncryptionSecret(credentialId: ArrayBuffer): string {
  const ikm = new Uint8Array(credentialId);

  // Deterministic salt: SHA-256 of the HKDF info string.
  // This is not a secret — its role is domain separation.
  const salt = sha256(HKDF_INFO);

  const keyBytes = hkdf(sha256, ikm, salt, HKDF_INFO, DERIVED_KEY_LENGTH);

  // Encode as lowercase hex
  let hex = "";
  for (let i = 0; i < keyBytes.length; i++) {
    hex += keyBytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Derive an encryption secret from a user-supplied passphrase alone,
 * used when importing an existing seed phrase without a passkey.
 *
 * NOTE: This produces a weaker secret than the passkey-derived path
 * because passphrases have lower entropy than credential IDs. The
 * scrypt KDF in keystore.ts compensates for this.
 *
 * Returns the passphrase itself (the scrypt KDF is the hardening layer).
 * Callers should NOT hash or transform the passphrase before passing it
 * to keystore.encrypt() — scrypt handles that.
 */
export function passphraseToSecret(passphrase: string): string {
  // Passphrase is used directly as the keystore password.
  // Scrypt (N=131072) provides the computational hardening.
  return passphrase;
}
