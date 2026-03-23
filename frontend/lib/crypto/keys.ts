/**
 * BIP-44 Ethereum key derivation.
 *
 * Derives secp256k1 key pairs from a BIP-39 binary seed using BIP-32 HD
 * derivation. All Ethereum accounts follow the canonical BIP-44 path:
 *
 *   m/44'/60'/0'/0/{index}
 *
 * The address is computed as keccak256(uncompressed_public_key[1:])[12:]
 * and returned in EIP-55 checksum format.
 *
 * Railgun key paths (spending / viewing) are derived by the Kohaku Railgun
 * module — this file handles only Ethereum keys.
 *
 * Dependencies (must be installed): @scure/bip32, @noble/hashes, @noble/curves
 */

import { HDKey } from "@scure/bip32";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";

// BIP-44 coin type 60 = Ethereum
const ETH_BIP44_PREFIX = "m/44'/60'/0'/0";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EthKeyPair {
  /** Raw 32-byte secp256k1 private key */
  privateKey: Uint8Array;
  /** Compressed 33-byte secp256k1 public key (as returned by @scure/bip32) */
  publicKey: Uint8Array;
  /** EIP-55 checksummed Ethereum address (0x-prefixed) */
  address: string;
  /** BIP-44 derivation path used */
  path: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive an Ethereum keypair from a BIP-39 binary seed at the given index.
 *
 * `seed` is the 64-byte output of mnemonicToSeed() — NOT the mnemonic string
 * itself and NOT the hex-encoded seed.
 *
 * @param seed   64-byte Uint8Array from @scure/bip39 mnemonicToSeedSync
 * @param index  Account index (0-based). 0 is the primary account.
 */
export function deriveEthKey(seed: Uint8Array, index: number = 0): EthKeyPair {
  if (seed.length !== 64) {
    throw new Error(`keys: expected 64-byte BIP-39 seed, got ${seed.length} bytes`);
  }
  if (index < 0 || !Number.isInteger(index)) {
    throw new Error(`keys: index must be a non-negative integer, got ${index}`);
  }

  const path = `${ETH_BIP44_PREFIX}/${index}`;
  const master = HDKey.fromMasterSeed(seed);
  const child = master.derive(path);

  if (!child.privateKey) {
    throw new Error(`keys: key derivation produced no private key at path ${path}`);
  }
  if (!child.publicKey) {
    throw new Error(`keys: key derivation produced no public key at path ${path}`);
  }

  const address = publicKeyToAddress(child.publicKey);

  return {
    privateKey: child.privateKey,
    publicKey: child.publicKey,
    address,
    path,
  };
}

/**
 * Derive multiple Ethereum keypairs from a single seed.
 *
 * Useful for wallet discovery (scanning accounts) or multi-account setup.
 *
 * @param seed   64-byte Uint8Array from @scure/bip39 mnemonicToSeedSync
 * @param count  Number of accounts to derive
 * @param start  Starting index (default 0)
 */
export function deriveEthKeys(
  seed: Uint8Array,
  count: number,
  start: number = 0
): EthKeyPair[] {
  const results: EthKeyPair[] = [];
  for (let i = start; i < start + count; i++) {
    results.push(deriveEthKey(seed, i));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Internal: public key → Ethereum address
// ---------------------------------------------------------------------------

/**
 * Compute the Ethereum address from a compressed secp256k1 public key.
 *
 * Steps (per the Ethereum Yellow Paper):
 *   1. Decompress the 33-byte compressed pubkey → 65-byte uncompressed form
 *   2. Drop the 0x04 prefix → 64 bytes of (x, y)
 *   3. keccak256(64 bytes)
 *   4. Take the last 20 bytes → raw address
 *   5. Apply EIP-55 checksum encoding
 */
function publicKeyToAddress(compressedPubKey: Uint8Array): string {
  const uncompressed = decompressPublicKey(compressedPubKey);
  // Drop the 0x04 prefix; hash the remaining 64 bytes
  const hash = keccak_256(uncompressed.slice(1));
  // Address is the last 20 bytes of the hash
  const addressBytes = hash.slice(-20);
  return toChecksumAddress(addressBytes);
}

/**
 * Decompress a 33-byte secp256k1 compressed public key to 65 bytes.
 *
 * Uses @noble/curves for the point decompression — this is the same
 * library that @scure/bip32 depends on internally, so it adds no new
 * dependency weight.
 */
function decompressPublicKey(compressed: Uint8Array): Uint8Array {
  const hex = Array.from(compressed).map(b => b.toString(16).padStart(2, "0")).join("");
  const point = secp256k1.Point.fromHex(hex);
  // toRawBytes(false) → uncompressed 65-byte form (04 || x || y)
  return point.toBytes(false);
}

/**
 * Convert a 20-byte Ethereum address to EIP-55 mixed-case checksum format.
 *
 * Algorithm (EIP-55):
 *   1. Hex-encode the address bytes (lowercase, no 0x prefix)
 *   2. keccak256 of the lowercase hex string
 *   3. For each character at position i:
 *        if hash nibble[i] >= 8 → uppercase, else lowercase
 *   4. Prepend 0x
 */
function toChecksumAddress(addressBytes: Uint8Array): string {
  const hex = Array.from(addressBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(""); // 40 lowercase hex chars, no 0x

  const hashBytes = keccak_256(new TextEncoder().encode(hex));
  const hashHex = Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  let checksummed = "0x";
  for (let i = 0; i < hex.length; i++) {
    // parseInt(hashHex[i], 16) is the nibble value at position i
    checksummed += parseInt(hashHex[i], 16) >= 8 ? hex[i].toUpperCase() : hex[i];
  }

  return checksummed;
}
