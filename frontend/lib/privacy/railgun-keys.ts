/**
 * Railgun key derivation — BabyJubJub keys from BIP-39 mnemonic.
 *
 * Ported from Kohaku SDK:
 *   - bip32.ts: getMasterKeyFromSeed, childKeyDerivationHardened
 *   - wallet-node.ts: WalletNode, deriveNodes, getSpendingKeyPair, getViewingKeyPair
 *   - keys-utils.ts: getPublicSpendingKey, getPublicViewingKey
 *   - bech32.ts: encodeAddress
 *   - keys.ts: getMasterPublicKey
 *   - address.ts: makeGetRailgunAddress
 *
 * Uses @noble/ed25519 for Ed25519 viewing keys and @railgun-community/circomlibjs
 * for EdDSA (BabyJubJub) spending keys + Poseidon hash.
 *
 * All key material is zeroed after use where possible.
 */

import { hmac } from "@noble/hashes/hmac.js";
import { sha512 as sha512Hash } from "@noble/hashes/sha2.js";
import { mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { bech32m } from "@scure/base";
import { ed25519 } from "@noble/curves/ed25519.js";

import type {
  KeyNode,
  SpendingPublicKey,
  SpendingKeyPair,
  ViewingKeyPair,
  RailgunKeys,
} from "./types";

import {
  SPENDING_PATH_PREFIX,
  VIEWING_PATH_PREFIX,
  BJJ_CURVE_SEED,
  ADDRESS_VERSION,
  ADDRESS_PREFIX,
  ADDRESS_LENGTH_LIMIT,
} from "./constants";

// ---------------------------------------------------------------------------
// Hex / byte utilities (minimal, browser-safe)
// ---------------------------------------------------------------------------

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function padHex(hex: string, byteLength: number): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return clean.padStart(byteLength * 2, "0");
}

function hexToBigInt(hex: string): bigint {
  const clean = hex.startsWith("0x") ? hex : `0x${hex}`;
  return BigInt(clean);
}

function bigIntToHex(n: bigint, byteLength: number): string {
  if (n < 0n) throw new Error("bigint must be positive");
  return n.toString(16).padStart(byteLength * 2, "0");
}

function bigIntToBytes(n: bigint, byteLength: number): Uint8Array {
  return fromHex(bigIntToHex(n, byteLength));
}

// ---------------------------------------------------------------------------
// HMAC-SHA512 (for BIP-32 BabyJubJub derivation)
// ---------------------------------------------------------------------------

function hmacSha512(key: string | Uint8Array, data: string | Uint8Array): string {
  const keyBytes = typeof key === "string" ? fromHex(key) : key;
  const dataBytes = typeof data === "string" ? fromHex(data) : data;
  return toHex(hmac(sha512Hash, keyBytes, dataBytes));
}

// ---------------------------------------------------------------------------
// BIP-32 BabyJubJub key derivation
// (from Kohaku bip32.ts)
// ---------------------------------------------------------------------------

const HARDENED_OFFSET = 0x80000000;

function getMasterKeyFromSeed(seedHex: string): KeyNode {
  const curveKey = new TextEncoder().encode(BJJ_CURVE_SEED);
  const I = hmacSha512(toHex(curveKey), seedHex);
  return {
    chainKey: I.slice(0, 64),
    chainCode: I.slice(64),
  };
}

function childKeyDerivationHardened(
  node: KeyNode,
  index: number,
  offset: number = HARDENED_OFFSET
): KeyNode {
  const indexFormatted = (index + offset).toString(16).padStart(8, "0");
  const preImage = `00${node.chainKey}${indexFormatted}`;
  const I = hmacSha512(node.chainCode, preImage);
  return {
    chainKey: I.slice(0, 64),
    chainCode: I.slice(64),
  };
}

function getPathSegments(path: string): number[] {
  if (!/^m(\/[0-9]+')+$/g.test(path)) throw new Error("Invalid derivation path");
  return path
    .split("/")
    .slice(1)
    .map((s) => parseInt(s.replace("'", ""), 10));
}

function deriveKeyNode(masterNode: KeyNode, path: string): KeyNode {
  const segments = getPathSegments(path);
  return segments.reduce<KeyNode>(
    (parent, segment) => childKeyDerivationHardened(parent, segment, HARDENED_OFFSET),
    masterNode
  );
}

// ---------------------------------------------------------------------------
// Poseidon hash (lazy-loaded from circomlibjs)
// ---------------------------------------------------------------------------

let poseidonFn: ((inputs: bigint[]) => bigint) | null = null;

async function loadPoseidon(): Promise<(inputs: bigint[]) => bigint> {
  if (poseidonFn) return poseidonFn;

  // Dynamic import to avoid bundling issues; circomlibjs provides BabyJubJub + Poseidon
  const circomlibjs = await import("@railgun-community/circomlibjs");
  const fn = circomlibjs.poseidon;
  poseidonFn = fn;
  return fn;
}

// ---------------------------------------------------------------------------
// Public key derivation
// ---------------------------------------------------------------------------

/**
 * Derive EdDSA (BabyJubJub) spending public key from private key.
 * Returns [x, y] field elements.
 * (from Kohaku keys-utils.ts: getPublicSpendingKey)
 */
async function getPublicSpendingKey(privateKey: Uint8Array): Promise<SpendingPublicKey> {
  if (privateKey.length !== 32) throw new Error("Invalid spending private key length");

  const circomlibjs = await import("@railgun-community/circomlibjs");
  // eddsa.prv2pub expects a Buffer in circomlibjs
  const buf = typeof Buffer !== "undefined" ? Buffer.from(privateKey) : privateKey;
  return circomlibjs.eddsa.prv2pub(buf) as SpendingPublicKey;
}

/**
 * Derive Ed25519 viewing public key from private key.
 * (from Kohaku keys-utils.ts: getPublicViewingKey)
 */
function getPublicViewingKey(privateKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(privateKey);
}

// ---------------------------------------------------------------------------
// Nullifying key
// ---------------------------------------------------------------------------

async function getNullifyingKey(viewingPrivateKey: Uint8Array): Promise<bigint> {
  const poseidon = await loadPoseidon();
  return poseidon([hexToBigInt(toHex(viewingPrivateKey))]);
}

// ---------------------------------------------------------------------------
// Master public key
// ---------------------------------------------------------------------------

async function getMasterPublicKey(
  spendingPubKey: SpendingPublicKey,
  nullifyingKey: bigint
): Promise<bigint> {
  const poseidon = await loadPoseidon();
  return poseidon([spendingPubKey[0], spendingPubKey[1], nullifyingKey]);
}

// ---------------------------------------------------------------------------
// Bech32m address encoding
// (from Kohaku bech32.ts: encodeAddress)
// ---------------------------------------------------------------------------

/**
 * XOR network ID with 'railgun' bytes for prettier addresses.
 */
function xorNetworkID(networkIdHex: string): string {
  const chainIdBytes = fromHex(networkIdHex.padStart(16, "0"));
  const railgunBytes = new TextEncoder().encode("railgun\0"); // 8 bytes

  const result = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    result[i] = (chainIdBytes[i] ?? 0) ^ (railgunBytes[i] ?? 0);
  }
  return toHex(result);
}

function encodeRailgunAddress(
  masterPublicKey: bigint,
  viewingPublicKey: Uint8Array
): string {
  const masterPkHex = bigIntToHex(masterPublicKey, 32);
  const viewingPkHex = padHex(toHex(viewingPublicKey), 32);

  // All-chains network ID (undefined chain)
  const networkID = xorNetworkID("ffffffffffffffff");
  const version = "01";
  const addressString = `${version}${masterPkHex}${networkID}${viewingPkHex}`;

  const addressBytes = fromHex(addressString);
  return bech32m.encode(
    ADDRESS_PREFIX,
    bech32m.toWords(addressBytes),
    ADDRESS_LENGTH_LIMIT
  );
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------

/**
 * Derive full Railgun key set from a BIP-39 mnemonic.
 *
 * This produces:
 *   - BabyJubJub spending key pair (EdDSA, Poseidon-based)
 *   - Ed25519 viewing key pair
 *   - Nullifying key (Poseidon hash of viewing private key)
 *   - Master public key (Poseidon of spending pubkey + nullifying key)
 *   - 0zk Railgun address (bech32m encoded)
 *
 * @param mnemonic  BIP-39 mnemonic phrase
 * @param index     Account index (default 0)
 */
export async function deriveRailgunKeys(
  mnemonic: string,
  index: number = 0
): Promise<RailgunKeys> {
  // 1. Convert mnemonic to BIP-39 seed (64 bytes), then to hex
  const seedBytes = mnemonicToSeedSync(mnemonic.trim().replace(/\s+/g, " "));
  const seedHex = toHex(seedBytes);

  // 2. Derive BabyJubJub master key from seed
  const masterKeyNode = getMasterKeyFromSeed(seedHex);

  // 3. Derive spending and viewing key nodes along their respective paths
  const spendingPath = `${SPENDING_PATH_PREFIX}${index}'`;
  const viewingPath = `${VIEWING_PATH_PREFIX}${index}'`;

  const spendingNode = deriveKeyNode(masterKeyNode, spendingPath);
  const viewingNode = deriveKeyNode(masterKeyNode, viewingPath);

  // 4. Extract key pairs
  const spendingPrivateKey = fromHex(spendingNode.chainKey);
  const spendingPubKey = await getPublicSpendingKey(spendingPrivateKey);
  const spending: SpendingKeyPair = {
    privateKey: spendingPrivateKey,
    pubkey: spendingPubKey,
  };

  const viewingPrivateKey = fromHex(viewingNode.chainKey);
  const viewingPubKey = getPublicViewingKey(viewingPrivateKey);
  const viewing: ViewingKeyPair = {
    privateKey: viewingPrivateKey,
    pubkey: viewingPubKey,
  };

  // 5. Compute nullifying key and master public key
  const nullifyingKey = await getNullifyingKey(viewingPrivateKey);
  const masterPublicKey = await getMasterPublicKey(spendingPubKey, nullifyingKey);

  // 6. Encode 0zk address
  const address = encodeRailgunAddress(masterPublicKey, viewingPubKey);

  // Zero the seed
  seedBytes.fill(0);

  return {
    spending,
    viewing,
    masterPublicKey,
    nullifyingKey,
    address,
  };
}

/**
 * Re-export for shield.ts — computes Poseidon hash.
 */
export { loadPoseidon, toHex, fromHex, padHex, hexToBigInt, bigIntToHex, bigIntToBytes };
