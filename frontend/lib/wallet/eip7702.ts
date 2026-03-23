/**
 * EIP-7702 authorization signing.
 *
 * The user's EOA signs an authorization that delegates code execution to
 * AmbireAccount7702 for a single transaction. This authorization is included
 * in a Type 4 (EIP-7702) transaction or embedded in a UserOperation's
 * paymasterData / initCode field so the EntryPoint can activate it.
 *
 * Signing payload per EIP-7702:
 *   hash = keccak256(0x05 || rlp([chainId, address, nonce]))
 *
 * Where:
 *   0x05   — EIP-7702 magic byte (distinguishes from other typed-data domains)
 *   address — the implementation contract to delegate to (AmbireAccount7702)
 *   nonce   — the EOA's current account nonce (prevents replay across tx nonces)
 *
 * No ethers.js, no web3.js. Only @noble/curves and the RLP encoder from
 * transaction.ts (re-exported here for module isolation).
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { rlpEncode } from "./transaction";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** EIP-7702 magic byte prefix — prepended before the RLP payload before hashing. */
const EIP7702_MAGIC = 0x05;

/**
 * AmbireAccount7702 deployed address.
 * Source: agents/ambire-7702.md — "Deployed Contracts"
 */
export const AMBIRE_ACCOUNT_7702 =
  "0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The unsigned authorization data returned by the backend in the gasless
 * quote response (`/trade/quote-gasless`).
 */
export interface EIP7702Authorization {
  /** EIP-155 chain ID */
  chainId: number;
  /** Implementation contract address — AmbireAccount7702 */
  address: string;
  /** EOA's current account nonce — must match on-chain at execution time */
  nonce: number;
}

/**
 * A signed EIP-7702 authorization — all numeric fields are 0x-prefixed hex
 * as expected by the bundler / relayer JSON-RPC API.
 */
export interface SignedEIP7702Auth {
  chainId: string;  // 0x-prefixed hex
  address: string;  // EIP-55 checksummed
  nonce: string;    // 0x-prefixed hex
  yParity: string;  // "0x0" or "0x1"
  r: string;        // 0x-prefixed hex, 32 bytes
  s: string;        // 0x-prefixed hex, 32 bytes
}

// ---------------------------------------------------------------------------
// signEIP7702Auth
// ---------------------------------------------------------------------------

/**
 * Sign an EIP-7702 authorization tuple.
 *
 * Algorithm:
 *   1. RLP-encode [chainId, address, nonce]  (minimal int encoding for numbers,
 *      raw 20 bytes for address — same rules as EIP-1559 transaction fields)
 *   2. Prepend the 0x05 magic byte
 *   3. keccak256 hash the result
 *   4. Sign with secp256k1 (lowS = true for EIP-2 malleability protection)
 *   5. Return (yParity, r, s) as 0x-prefixed hex strings
 *
 * @param auth        Authorization data from the backend gasless quote
 * @param privateKey  Raw 32-byte secp256k1 private key from WalletManager
 */
export function signEIP7702Auth(
  auth: EIP7702Authorization,
  privateKey: Uint8Array
): SignedEIP7702Auth {
  // Step 1: Build the RLP list [chainId, address, nonce].
  //
  // Encoding rules (same as EIP-1559 transaction fields):
  //   - chainId, nonce → minimal big-endian bytes (empty for 0)
  //   - address        → exactly 20 raw bytes, no stripping
  const chainIdBytes = intToMinimalBytes(auth.chainId);
  const addressBytes = hexToAddress(auth.address);
  const nonceBytes = intToMinimalBytes(auth.nonce);

  const rlpPayload = rlpEncode([chainIdBytes, addressBytes, nonceBytes]);

  // Step 2: Prepend 0x05 magic byte.
  const toHash = new Uint8Array(1 + rlpPayload.length);
  toHash[0] = EIP7702_MAGIC;
  toHash.set(rlpPayload, 1);

  // Step 3: keccak256 hash.
  const msgHash = keccak_256(toHash);

  // Step 4: Sign.
  // secp256k1.sign with format:'recovered' → 65-byte Uint8Array:
  //   [0]      = recovery bit (0 or 1)
  //   [1..32]  = r (big-endian, 32 bytes)
  //   [33..64] = s (big-endian, 32 bytes)
  const sig65 = secp256k1.sign(msgHash, privateKey, {
    lowS: true,
    format: "recovered",
  });

  const yParity = sig65[0]; // 0 or 1
  const r = sig65.slice(1, 33);
  const s = sig65.slice(33, 65);

  // Step 5: Encode as 0x-prefixed hex strings.
  return {
    chainId: "0x" + auth.chainId.toString(16),
    address: auth.address, // pass through — backend provided the checksummed address
    nonce: "0x" + auth.nonce.toString(16),
    yParity: yParity === 0 ? "0x0" : "0x1",
    r: "0x" + bytesToHex(r),
    s: "0x" + bytesToHex(s),
  };
}

// ---------------------------------------------------------------------------
// Private helpers (local — not exported to avoid duplicating transaction.ts)
// ---------------------------------------------------------------------------

/**
 * Convert a non-negative integer to its minimal big-endian byte representation.
 * Returns empty Uint8Array for 0 — RLP encodes integer zero as the empty string.
 */
function intToMinimalBytes(n: number): Uint8Array {
  if (n === 0) return new Uint8Array(0);
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = (v / 256) | 0;
  }
  return new Uint8Array(bytes);
}

/**
 * Parse a 0x-prefixed 20-byte Ethereum address to a raw 20-byte Uint8Array.
 * Throws if the input is not exactly 40 hex chars (20 bytes).
 */
function hexToAddress(address: string): Uint8Array {
  const h = address.startsWith("0x") ? address.slice(2) : address;
  if (h.length !== 40) {
    throw new Error(
      `hexToAddress: expected 40 hex chars, got ${h.length} ("${address}")`
    );
  }
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 40; i += 2) {
    bytes[i / 2] = parseInt(h.slice(i, i + 2), 16);
  }
  return bytes;
}

/** Convert a Uint8Array to a lowercase hex string (no 0x prefix). */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
