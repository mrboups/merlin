/**
 * BIP-39 mnemonic generation and validation.
 *
 * Uses @scure/bip39 — a well-audited, minimal implementation.
 * Generates 24-word phrases (256 bits of entropy) by default.
 *
 * Key derivation paths used in Merlin (per Kohaku agent spec):
 *   Ethereum:          m/44'/60'/0'/0/{index}
 *   Railgun spending:  m/44'/1984'/0'/0'/{index}
 *   Railgun viewing:   m/420'/1984'/0'/0'/{index}
 *
 * Dependencies (must be installed): @scure/bip39
 */

import { generateMnemonic, validateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

// BIP-39 entropy sizes: 128 bits → 12 words, 256 bits → 24 words
const ENTROPY_BITS = 256;

/**
 * Generate a new 24-word BIP-39 mnemonic using 256 bits of cryptographic
 * entropy sourced from the platform's CSPRNG.
 *
 * Never call this more than once per account — the returned phrase IS the
 * account. The caller must immediately encrypt it via keystore.encrypt()
 * and discard the plaintext.
 */
export function createMnemonic(): string {
  return generateMnemonic(wordlist, ENTROPY_BITS);
}

/**
 * Validate a BIP-39 mnemonic phrase.
 *
 * Checks both word validity (against the English wordlist) and checksum.
 * Returns false for 12-word phrases when we expect 24-word phrases — this
 * is intentional: we always generate 24-word phrases.
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim(), wordlist);
}

/**
 * Normalise a mnemonic for storage and comparison.
 * Trims whitespace and collapses multiple spaces between words.
 */
export function normaliseMnemonic(mnemonic: string): string {
  return mnemonic.trim().replace(/\s+/g, " ");
}

/**
 * Convert a BIP-39 mnemonic to a 64-byte binary seed.
 *
 * The seed is the input to BIP-32 HD key derivation (HDKey.fromMasterSeed).
 * An optional BIP-39 passphrase adds an extra layer of deterministic
 * protection — a different passphrase produces an entirely different wallet.
 *
 * IMPORTANT: the returned Uint8Array contains key material. Zero it out
 * (seed.fill(0)) once key derivation is complete.
 */
export function mnemonicToSeed(mnemonic: string, passphrase?: string): Uint8Array {
  return mnemonicToSeedSync(normaliseMnemonic(mnemonic), passphrase);
}
