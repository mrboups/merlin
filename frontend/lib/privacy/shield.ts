/**
 * Shield transaction builder — moves tokens from public to private (Railgun).
 *
 * Shield does NOT require ZK proofs (Groth16). It's a simple contract call:
 *   1. Build a ShieldNoteERC20 (masterPubKey, random, value, token)
 *   2. Encrypt random with shared symmetric key (AES-GCM)
 *   3. Encrypt receiver's viewing public key with shield private key (AES-CTR)
 *   4. Encode RailgunSmartWallet.shield(requests[]) calldata
 *   5. For native ETH: RelayAdapt.wrapBase() + shield() via multicall
 *
 * Ported from Kohaku SDK:
 *   - shield.ts: makeCreateShield
 *   - shield-note.ts: ShieldNote.serialize()
 *   - note-util.ts: getTokenDataERC20
 *   - keys-utils.ts: getSharedSymmetricKey
 *   - encryption/aes.ts: AES.encryptGCM, AES.encryptCTR
 *
 * No ethers.js dependency — uses a minimal ABI encoder matching the contract structs.
 *
 * Reference: sources/kohaku-master/.../account/tx/shield.ts
 */

import { keccak_256 } from "@noble/hashes/sha3.js";
import { ed25519 } from "@noble/curves/ed25519.js";

import type {
  ShieldCiphertext,
  ShieldRequest,
  ShieldTxData,
  RailgunNetworkConfig,
  TokenData,
} from "./types";
import { TokenType } from "./types";
import {
  ZERO_ADDRESS,
  E_ADDRESS,
  TOKEN_SUB_ID_NULL,
} from "./constants";
import {
  loadPoseidon,
  toHex,
  fromHex,
  padHex,
  hexToBigInt,
  bigIntToHex,
} from "./railgun-keys";

// ---------------------------------------------------------------------------
// Hex / encoding utilities
// ---------------------------------------------------------------------------

function strip0x(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

function with0x(hex: string): string {
  return hex.startsWith("0x") ? hex : `0x${hex}`;
}

function encodePacked(...parts: string[]): string {
  return parts.map(strip0x).join("");
}

// ---------------------------------------------------------------------------
// Minimal ABI encoder (no ethers)
//
// Encodes function calls for:
//   - RailgunSmartWallet.shield(ShieldRequest[])
//   - RelayAdapt.wrapBase(uint256)
//   - RelayAdapt.multicall(bool, (address,bytes,uint256)[])
//
// We encode these fixed-structure calls manually instead of pulling in
// a 500KB ABI encoder library.
// ---------------------------------------------------------------------------

/** keccak256 of function signature, first 4 bytes */
function fnSelector(signature: string): string {
  const hash = keccak_256(new TextEncoder().encode(signature));
  return toHex(hash.slice(0, 4));
}

/** Encode a uint256 as 32-byte hex (no 0x prefix) */
function encUint256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

/** Encode an address as 32-byte left-padded hex (no 0x prefix) */
function encAddress(addr: string): string {
  return strip0x(addr).toLowerCase().padStart(64, "0");
}

/** Encode a bytes32 as 32-byte hex (no 0x prefix) */
function encBytes32(hex: string): string {
  return strip0x(hex).padEnd(64, "0").slice(0, 64);
}

/** Encode dynamic bytes with offset, length, padded data */
function encDynBytes(hex: string): string {
  const data = strip0x(hex);
  const byteLen = data.length / 2;
  const paddedData = data.padEnd(Math.ceil(data.length / 64) * 64, "0");
  return encUint256(BigInt(byteLen)) + paddedData;
}

/**
 * Encode RailgunSmartWallet.shield(ShieldRequest[]) calldata.
 *
 * Function signature:
 *   shield((
 *     (uint256, (uint256,address,uint256), uint120),  // preimage: npk, token, value
 *     (bytes32[3], bytes32)                           // ciphertext: encryptedBundle, shieldKey
 *   )[])
 */
function encodeShieldCalldata(requests: ShieldRequest[]): string {
  // shield((((uint256,(uint256,address,uint256),uint120),(bytes32[3],bytes32))[])
  const selector = fnSelector(
    "shield(((uint256,(uint256,address,uint256),uint120),(bytes32[3],bytes32))[])"
  );

  // Dynamic array: offset to data
  let encoded = encUint256(32n); // offset to array data

  // Array length
  encoded += encUint256(BigInt(requests.length));

  // Each ShieldRequest is a fixed-size tuple (no dynamic fields inside)
  // Preimage: npk (uint256) + token tuple (uint256, address, uint256) + value (uint120)
  // Ciphertext: encryptedBundle (bytes32[3]) + shieldKey (bytes32)
  // Total: 8 x 32 bytes per request
  for (const req of requests) {
    // preimage.npk
    encoded += encUint256(hexToBigInt(strip0x(req.preimage.npk)));
    // preimage.token.tokenType
    encoded += encUint256(BigInt(req.preimage.token.tokenType));
    // preimage.token.tokenAddress
    encoded += encAddress(req.preimage.token.tokenAddress);
    // preimage.token.tokenSubID
    encoded += encUint256(hexToBigInt(strip0x(req.preimage.token.tokenSubID)));
    // preimage.value (uint120)
    encoded += encUint256(req.preimage.value);
    // ciphertext.encryptedBundle[0..2]
    encoded += encBytes32(req.ciphertext.encryptedBundle[0]);
    encoded += encBytes32(req.ciphertext.encryptedBundle[1]);
    encoded += encBytes32(req.ciphertext.encryptedBundle[2]);
    // ciphertext.shieldKey
    encoded += encBytes32(req.ciphertext.shieldKey);
  }

  return `0x${selector}${encoded}`;
}

/**
 * Encode RelayAdapt.wrapBase(uint256) calldata.
 */
function encodeWrapBaseCalldata(amount: bigint): string {
  const selector = fnSelector("wrapBase(uint256)");
  return `0x${selector}${encUint256(amount)}`;
}

/**
 * Encode RelayAdapt.multicall(bool, (address, bytes, uint256)[]) calldata.
 *
 * The calls array contains dynamic bytes, so this requires proper ABI dynamic encoding.
 */
function encodeMulticallCalldata(
  calls: Array<{ to: string; data: string; value: bigint }>
): string {
  const selector = fnSelector("multicall(bool,(address,bytes,uint256)[])");

  // Head: bool (requireSuccess=true) + offset to calls array
  let head = encUint256(1n); // true
  head += encUint256(64n); // offset to calls array (2 x 32 bytes past)

  // Calls array
  let callsEncoded = encUint256(BigInt(calls.length)); // array length

  // Each tuple has dynamic bytes, so we need offsets
  // Calculate offsets: each tuple head is 3 x 32 bytes (to, data_offset, value)
  // But data is dynamic, so we use standard ABI offset encoding
  const tupleHeadSize = calls.length * 32; // offsets to each tuple
  const tupleDataParts: string[] = [];

  let currentOffset = calls.length * 32; // start after all tuple offsets

  for (let i = 0; i < calls.length; i++) {
    // Write offset to this tuple
    callsEncoded += encUint256(BigInt(currentOffset));

    // Build tuple data
    let tupleData = "";
    tupleData += encAddress(calls[i].to); // address (static)
    tupleData += encUint256(96n); // offset to bytes data (3 x 32 = 96)
    tupleData += encUint256(calls[i].value); // uint256 value (static)
    // Dynamic bytes
    tupleData += encDynBytes(calls[i].data);

    tupleDataParts.push(tupleData);
    currentOffset += tupleData.length / 2; // byte length
  }

  callsEncoded += tupleDataParts.join("");

  return `0x${selector}${head}${callsEncoded}`;
}

// ---------------------------------------------------------------------------
// AES encryption (browser Web Crypto API)
// Ported from Kohaku encryption/aes.ts — browser path only
// ---------------------------------------------------------------------------

async function aesEncryptGCM(
  plaintext: string[],
  key: Uint8Array
): Promise<{ iv: string; tag: string; data: string[] }> {
  const iv = crypto.getRandomValues(new Uint8Array(16));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as ArrayBufferView<ArrayBuffer>,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const blocks: Uint8Array[] = plaintext.map((p) => fromHex(strip0x(p)));
  const blockLengths = blocks.map((b) => b.length);
  const totalLen = blockLengths.reduce((a, b) => a + b, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const block of blocks) {
    combined.set(block, offset);
    offset += block.length;
  }

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    cryptoKey,
    combined as ArrayBufferView<ArrayBuffer>
  );

  const enc = new Uint8Array(encrypted);
  const tag = enc.slice(-16);
  const ciphertextOnly = enc.slice(0, -16);

  const data: string[] = [];
  offset = 0;
  for (const len of blockLengths) {
    data.push(toHex(ciphertextOnly.slice(offset, offset + len)));
    offset += len;
  }

  return {
    iv: padHex(toHex(iv), 16),
    tag: padHex(toHex(tag), 16),
    data,
  };
}

async function aesEncryptCTR(
  plaintext: string[],
  key: Uint8Array
): Promise<{ iv: string; data: string[] }> {
  const iv = crypto.getRandomValues(new Uint8Array(16));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as ArrayBufferView<ArrayBuffer>,
    { name: "AES-CTR" },
    false,
    ["encrypt"]
  );

  const data: string[] = [];
  for (const p of plaintext) {
    const ptBytes = fromHex(strip0x(p));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-CTR", counter: iv, length: 128 },
      cryptoKey,
      ptBytes as ArrayBufferView<ArrayBuffer>
    );
    data.push(toHex(new Uint8Array(encrypted)));
  }

  return {
    iv: padHex(toHex(iv), 16),
    data,
  };
}

// ---------------------------------------------------------------------------
// Shared symmetric key (X25519 ECDH + SHA-256)
// (from Kohaku keys-utils.ts: getSharedSymmetricKey)
// ---------------------------------------------------------------------------

async function getSharedSymmetricKey(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Promise<Uint8Array> {
  // Use noble's built-in getExtendedPublicKey to extract the clamped scalar
  // This handles SHA-512 hashing + clamping internally
  const { scalar } = ed25519.utils.getExtendedPublicKey(privateKey);

  // Scalar multiply the public key point by the private scalar
  const pkPoint = ed25519.Point.fromHex(toHex(publicKey));
  const sharedPoint = pkPoint.multiply(scalar);
  const sharedBytes = sharedPoint.toBytes();

  // SHA-256 of the shared point to get the symmetric key
  const hashed = await crypto.subtle.digest(
    "SHA-256",
    sharedBytes as ArrayBufferView<ArrayBuffer>
  );
  return new Uint8Array(hashed);
}

// ---------------------------------------------------------------------------
// Shield note serialization
// (from Kohaku shield-note.ts: ShieldNote.serialize)
// ---------------------------------------------------------------------------

const SHIELD_SIGNATURE_MESSAGE = "RAILGUN_SHIELD";

/**
 * Get shield private key by signing the RAILGUN_SHIELD message.
 * The shield private key = keccak256(signature).
 *
 * @param signMessage  Function that signs a message with the user's ETH key
 */
export async function getShieldPrivateKey(
  signMessage: (message: string) => Promise<string>
): Promise<Uint8Array> {
  const signature = await signMessage(SHIELD_SIGNATURE_MESSAGE);
  const sigBytes = fromHex(strip0x(signature));
  return keccak_256(sigBytes);
}

/**
 * Build a serialized ShieldRequest for an ERC-20 token.
 */
async function buildShieldRequest(
  masterPublicKey: bigint,
  viewingPublicKey: Uint8Array,
  shieldPrivateKey: Uint8Array,
  tokenAddress: string,
  value: bigint
): Promise<ShieldRequest> {
  const poseidon = await loadPoseidon();

  // Generate random (16 bytes)
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const random = toHex(randomBytes);

  // Note public key = Poseidon(masterPublicKey, random)
  const notePublicKey = poseidon([masterPublicKey, hexToBigInt(random)]);

  // Shared symmetric key for encryption
  const sharedKey = await getSharedSymmetricKey(shieldPrivateKey, viewingPublicKey);

  // Encrypt random with AES-GCM
  const encryptedRandom = await aesEncryptGCM([random], sharedKey);

  // Encrypt receiver's viewing public key with AES-CTR using shield private key
  const encryptedReceiver = await aesEncryptCTR(
    [toHex(viewingPublicKey)],
    shieldPrivateKey
  );

  // Shield key = Ed25519 public key of shield private key
  const shieldKey = toHex(ed25519.getPublicKey(shieldPrivateKey));

  // Construct ciphertext (matching Kohaku's format)
  const ciphertext: ShieldCiphertext = {
    encryptedBundle: [
      with0x(padHex(`${encryptedRandom.iv}${encryptedRandom.tag}`, 32)),
      with0x(padHex(encodePacked(...encryptedRandom.data, encryptedReceiver.iv), 32)),
      with0x(padHex(encodePacked(...encryptedReceiver.data), 32)),
    ],
    shieldKey: with0x(padHex(shieldKey, 32)),
  };

  // Token data for ERC-20
  const tokenData: TokenData = {
    tokenType: TokenType.ERC20,
    tokenAddress: tokenAddress.toLowerCase(),
    tokenSubID: with0x(padHex("00", 32)),
  };

  return {
    preimage: {
      npk: with0x(bigIntToHex(notePublicKey, 32)),
      token: tokenData,
      value,
    },
    ciphertext,
  };
}

// ---------------------------------------------------------------------------
// Public API: build shield transactions
// ---------------------------------------------------------------------------

/**
 * Build a shield transaction for an ERC-20 token.
 *
 * The user must approve the token to the RAILGUN_ADDRESS before calling this.
 * Returns unsigned tx data (to, data, value=0).
 */
export async function buildShieldERC20Tx(
  network: RailgunNetworkConfig,
  masterPublicKey: bigint,
  viewingPublicKey: Uint8Array,
  shieldPrivateKey: Uint8Array,
  tokenAddress: string,
  amount: bigint
): Promise<ShieldTxData> {
  const request = await buildShieldRequest(
    masterPublicKey,
    viewingPublicKey,
    shieldPrivateKey,
    tokenAddress,
    amount
  );

  const data = encodeShieldCalldata([request]);

  return {
    to: network.RAILGUN_ADDRESS,
    data,
    value: 0n,
  };
}

/**
 * Build a shield transaction for native ETH.
 *
 * Uses RelayAdapt to wrap ETH -> WETH, then shield.
 * Returns unsigned tx data (to=RELAY_ADAPT, data=multicall, value=amount).
 */
export async function buildShieldNativeTx(
  network: RailgunNetworkConfig,
  masterPublicKey: bigint,
  viewingPublicKey: Uint8Array,
  shieldPrivateKey: Uint8Array,
  amount: bigint
): Promise<ShieldTxData> {
  const request = await buildShieldRequest(
    masterPublicKey,
    viewingPublicKey,
    shieldPrivateKey,
    network.WETH,
    amount
  );

  const wrapData = encodeWrapBaseCalldata(amount);
  const shieldData = encodeShieldCalldata([request]);

  const calls = [
    { to: network.RELAY_ADAPT_ADDRESS, data: wrapData, value: amount },
    { to: network.RELAY_ADAPT_ADDRESS, data: shieldData, value: 0n },
  ];

  const data = encodeMulticallCalldata(calls);

  return {
    to: network.RELAY_ADAPT_ADDRESS,
    data,
    value: amount,
  };
}

/**
 * Determine if an address represents native ETH.
 */
export function isNativeToken(address: string): boolean {
  const lower = address.toLowerCase();
  return lower === ZERO_ADDRESS || lower === E_ADDRESS;
}
