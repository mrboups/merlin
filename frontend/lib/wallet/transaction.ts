/**
 * Transaction signing and submission for Merlin.
 *
 * Signs EIP-1559 (Type 2) transactions using @noble/curves/secp256k1 and
 * manual RLP encoding. Submits via JSON-RPC and polls for confirmation.
 *
 * No ethers.js, no web3.js, no viem — only @noble/curves and @noble/hashes,
 * both already installed in this project.
 *
 * @noble/curves v2 API notes:
 *   - secp256k1.sign(hash, key, { format: 'recovered' }) → 65-byte Uint8Array
 *     Layout: recovery[1] || r[32] || s[32]
 *   - secp256k1.getPublicKey(key, false) → 65-byte uncompressed point (04 || x || y)
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

// ---------------------------------------------------------------------------
// RPC endpoint
// ---------------------------------------------------------------------------

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://eth-sepolia.g.alchemy.com/v2/hS8jJ10B9ZClEfEAjuI95";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UnsignedTx {
  /** Recipient address, 0x-prefixed */
  to: string;
  /** ABI-encoded calldata, 0x-prefixed ("0x" for pure ETH transfer) */
  data: string;
  /** Value in wei as 0x-prefixed hex ("0x0" for no value) */
  value: string;
  /** Gas limit as 0x-prefixed hex */
  gas: string;
  /** EIP-155 chain ID */
  chainId: number;
  /** Transaction nonce — fetched automatically via eth_getTransactionCount if omitted */
  nonce?: number;
  /** EIP-1559 max fee per gas as 0x-prefixed hex — fetched if omitted */
  maxFeePerGas?: string;
  /** EIP-1559 max priority fee per gas as 0x-prefixed hex — defaults to 1.5 gwei if omitted */
  maxPriorityFeePerGas?: string;
}

export interface SignedTxResult {
  /** Complete RLP-encoded signed transaction, 0x-prefixed */
  rawTransaction: string;
  /** keccak256 hash of the raw transaction bytes, 0x-prefixed */
  txHash: string;
}

export interface TxReceipt {
  transactionHash: string;
  blockNumber: number;
  /** true = success (status 0x1), false = reverted (status 0x0) */
  status: boolean;
  gasUsed: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sign an EIP-1559 (Type 2) transaction with the given secp256k1 private key.
 *
 * Fields that are absent from `tx` (nonce, maxFeePerGas) are fetched from
 * the configured RPC node before signing. All fetches run in parallel.
 */
export async function signTransaction(
  tx: UnsignedTx,
  privateKey: Uint8Array
): Promise<SignedTxResult> {
  const senderAddress = getAddressFromPrivateKey(privateKey);

  const [nonce, maxFeePerGas] = await Promise.all([
    tx.nonce !== undefined ? Promise.resolve(tx.nonce) : getNonce(senderAddress),
    tx.maxFeePerGas !== undefined
      ? Promise.resolve(tx.maxFeePerGas)
      : getMaxFeePerGas(),
  ]);
  const maxPriorityFeePerGas = tx.maxPriorityFeePerGas ?? "0x59682F00"; // 1.5 gwei

  // EIP-1559 unsigned tx fields:
  // rlp([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList])
  const unsignedFields: RlpItem[] = [
    intToBytes(tx.chainId),
    intToBytes(nonce),
    hexToMinimalBytes(maxPriorityFeePerGas),
    hexToMinimalBytes(maxFeePerGas),
    hexToMinimalBytes(tx.gas),
    addressToBytes(tx.to),    // address: always 20 bytes, no leading zero stripping
    hexToMinimalBytes(tx.value || "0x0"),
    hexToRawBytes(tx.data || "0x"), // calldata: preserve all bytes including leading zeros
    [],                       // empty accessList
  ];

  // Type-byte prefix: 0x02 = EIP-1559
  const encodedUnsigned = rlpEncode(unsignedFields);
  const toSign = new Uint8Array(1 + encodedUnsigned.length);
  toSign[0] = 0x02;
  toSign.set(encodedUnsigned, 1);

  const msgHash = keccak_256(toSign);

  // secp256k1.sign with format:'recovered' returns 65 bytes:
  //   sig[0]    = recovery bit (0 or 1)
  //   sig[1..32] = r (big-endian)
  //   sig[33..64] = s (big-endian)
  const sig65 = secp256k1.sign(msgHash, privateKey, {
    lowS: true,
    format: "recovered",
  });

  const v = sig65[0];              // recovery bit: 0 or 1 (EIP-1559 uses 0/1, not 27/28)
  const rBytes = sig65.slice(1, 33);
  const sBytes = sig65.slice(33, 65);

  const signedFields: RlpItem[] = [
    ...unsignedFields,
    intToBytes(v),
    stripLeadingZeros(rBytes), // RLP integers use minimal encoding
    stripLeadingZeros(sBytes),
  ];

  const encodedSigned = rlpEncode(signedFields);
  const rawTx = new Uint8Array(1 + encodedSigned.length);
  rawTx[0] = 0x02;
  rawTx.set(encodedSigned, 1);

  const rawTxHex = "0x" + bytesToHex(rawTx);
  const txHash = "0x" + bytesToHex(keccak_256(rawTx));

  return { rawTransaction: rawTxHex, txHash };
}

/**
 * Broadcast a signed raw transaction via eth_sendRawTransaction.
 * Returns the transaction hash as echoed by the node.
 */
export async function sendRawTransaction(rawTx: string): Promise<string> {
  return rpcCall<string>("eth_sendRawTransaction", [rawTx]);
}

/**
 * Poll for a transaction receipt until the transaction is mined or the
 * timeout expires.
 *
 * @param txHash        0x-prefixed transaction hash
 * @param timeoutMs     Maximum wait time in ms (default: 120 seconds)
 * @param pollIntervalMs Polling interval in ms (default: 3 seconds)
 * @throws If the transaction is not confirmed within `timeoutMs`
 */
export async function waitForReceipt(
  txHash: string,
  timeoutMs = 120_000,
  pollIntervalMs = 3_000
): Promise<TxReceipt> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const receipt = await rpcCall<RawReceipt | null>(
      "eth_getTransactionReceipt",
      [txHash]
    );

    if (receipt !== null) {
      return {
        transactionHash: receipt.transactionHash,
        blockNumber: parseInt(receipt.blockNumber, 16),
        status: receipt.status === "0x1",
        gasUsed: receipt.gasUsed,
      };
    }

    await delay(pollIntervalMs);
  }

  throw new Error(
    `Transaction ${txHash} was not confirmed within ${timeoutMs / 1000} seconds`
  );
}

/**
 * Derive the EIP-55 checksummed Ethereum address from a raw 32-byte private key.
 */
export function getAddressFromPrivateKey(privateKey: Uint8Array): string {
  // getPublicKey(key, false) → 65-byte uncompressed point: 04 || x || y
  const uncompressed = secp256k1.getPublicKey(privateKey, false);
  // Ethereum address = last 20 bytes of keccak256(uncompressed[1:])
  const hash = keccak_256(uncompressed.slice(1));
  return toChecksumAddress(hash.slice(12));
}

// ---------------------------------------------------------------------------
// RLP encoding
// ---------------------------------------------------------------------------

/**
 * An RLP item is either a raw byte string (Uint8Array) or a list of items.
 */
type RlpItem = Uint8Array | RlpItem[];

/**
 * Recursively RLP-encode an item according to Ethereum Yellow Paper Appendix B.
 *
 * Byte string rules:
 *   []          → 0x80 (empty string)
 *   [x] if x < 0x80 → x  (single byte, short)
 *   1..55 bytes → 0x80+len || bytes
 *   >55 bytes   → 0xb7+lenLen || len || bytes
 *
 * List rules (applied to the concatenated encoding of all elements):
 *   payload 0..55 bytes → 0xc0+payloadLen || payload
 *   payload >55 bytes   → 0xf7+lenLen || payloadLen || payload
 */
export function rlpEncode(item: RlpItem): Uint8Array {
  if (item instanceof Uint8Array) {
    return rlpEncodeBytes(item);
  }
  return rlpEncodeList(item as RlpItem[]);
}

function rlpEncodeBytes(bytes: Uint8Array): Uint8Array {
  const len = bytes.length;

  if (len === 0) {
    return new Uint8Array([0x80]);
  }

  if (len === 1 && bytes[0] < 0x80) {
    // Single byte in the range [0x00, 0x7f] is its own encoding.
    return bytes;
  }

  if (len <= 55) {
    const out = new Uint8Array(1 + len);
    out[0] = 0x80 + len;
    out.set(bytes, 1);
    return out;
  }

  // len > 55
  const lenBytes = uintToBytes(len);
  const out = new Uint8Array(1 + lenBytes.length + len);
  out[0] = 0xb7 + lenBytes.length;
  out.set(lenBytes, 1);
  out.set(bytes, 1 + lenBytes.length);
  return out;
}

function rlpEncodeList(items: RlpItem[]): Uint8Array {
  const encoded = items.map(rlpEncode);
  const payloadLen = encoded.reduce((acc, e) => acc + e.length, 0);

  const payload = new Uint8Array(payloadLen);
  let offset = 0;
  for (const enc of encoded) {
    payload.set(enc, offset);
    offset += enc.length;
  }

  if (payloadLen <= 55) {
    const out = new Uint8Array(1 + payloadLen);
    out[0] = 0xc0 + payloadLen;
    out.set(payload, 1);
    return out;
  }

  const lenBytes = uintToBytes(payloadLen);
  const out = new Uint8Array(1 + lenBytes.length + payloadLen);
  out[0] = 0xf7 + lenBytes.length;
  out.set(lenBytes, 1);
  out.set(payload, 1 + lenBytes.length);
  return out;
}

/**
 * Encode a positive integer in minimal big-endian bytes (no leading zeros).
 * Used for RLP length prefixes. Returns [0x00] for n=0 (only in length context).
 */
function uintToBytes(n: number): Uint8Array {
  if (n === 0) return new Uint8Array([0x00]);
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = (v / 256) | 0;
  }
  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a non-negative integer to its minimal big-endian byte representation.
 * Returns empty Uint8Array for 0 (the RLP encoding of integer zero is the empty string).
 */
function intToBytes(n: number): Uint8Array {
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
 * Convert a 0x-prefixed hex quantity to its minimal big-endian byte representation.
 *
 * "Minimal" means no leading zero bytes — this is required for numeric RLP fields
 * such as value, gas, nonce, maxFeePerGas, maxPriorityFeePerGas, chainId.
 *
 * "0x" or "0x0" → empty Uint8Array (RLP zero = empty bytes).
 */
function hexToMinimalBytes(hex: string): Uint8Array {
  const h = normalizeHex(hex);
  if (h === "") return new Uint8Array(0);

  // Strip leading zero nibbles to get minimal representation
  const stripped = h.replace(/^0+/, "") || "";
  if (stripped === "") return new Uint8Array(0);

  const padded = stripped.length % 2 === 0 ? stripped : "0" + stripped;
  return hexStringToBytes(padded);
}

/**
 * Convert a 0x-prefixed hex blob to raw bytes, preserving all bytes including
 * leading zeros. Used for calldata where leading zero bytes are meaningful.
 *
 * "0x" → empty Uint8Array.
 */
function hexToRawBytes(hex: string): Uint8Array {
  const h = normalizeHex(hex);
  if (h === "") return new Uint8Array(0);
  const padded = h.length % 2 === 0 ? h : "0" + h;
  return hexStringToBytes(padded);
}

/**
 * Convert a 0x-prefixed Ethereum address to its 20-byte representation.
 * Addresses are always exactly 20 bytes and must NOT have leading zeros stripped.
 */
function addressToBytes(address: string): Uint8Array {
  const h = normalizeHex(address);
  if (h.length !== 40) {
    throw new Error(
      `addressToBytes: expected 40 hex chars, got ${h.length} for "${address}"`
    );
  }
  return hexStringToBytes(h);
}

/**
 * Strip leading zero bytes from a Uint8Array.
 * Used to produce minimal-encoding r and s signature components.
 * Returns a single [0x00] byte if the entire array is zeros (should not happen
 * for valid secp256k1 signatures, but guards against edge cases).
 */
function stripLeadingZeros(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) {
    start++;
  }
  return bytes.slice(start);
}

/** Strip 0x prefix and lowercase */
function normalizeHex(hex: string): string {
  const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  return h.toLowerCase();
}

/** Parse a lowercase even-length hex string to bytes */
function hexStringToBytes(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

/** Convert bytes to lowercase hex string (no 0x prefix) */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Apply EIP-55 checksum to a 20-byte address */
function toChecksumAddress(addressBytes: Uint8Array): string {
  const hex = bytesToHex(addressBytes);
  const hashBytes = keccak_256(new TextEncoder().encode(hex));
  const hashHex = bytesToHex(hashBytes);
  let result = "0x";
  for (let i = 0; i < hex.length; i++) {
    result += parseInt(hashHex[i], 16) >= 8 ? hex[i].toUpperCase() : hex[i];
  }
  return result;
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

/** Raw receipt shape from eth_getTransactionReceipt */
interface RawReceipt {
  transactionHash: string;
  blockNumber: string;
  /** "0x1" = success, "0x0" = reverted */
  status: string;
  gasUsed: string;
}

let _rpcId = 1;

/**
 * Make a JSON-RPC call. Throws on network error or JSON-RPC error response.
 */
async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const id = _rpcId++;
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `RPC HTTP ${response.status} ${response.statusText} for method ${method}`
    );
  }

  const json: JsonRpcResponse<T> = await response.json();

  if (json.error) {
    throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
  }

  // eth_getTransactionReceipt legitimately returns null when pending
  if (json.result === undefined && method !== "eth_getTransactionReceipt") {
    throw new Error(`RPC returned no result for method ${method}`);
  }

  return json.result as T;
}

/** Fetch the pending transaction count (nonce) for a given address */
async function getNonce(address: string): Promise<number> {
  const hex = await rpcCall<string>("eth_getTransactionCount", [
    address,
    "pending",
  ]);
  return parseInt(hex, 16);
}

/**
 * Fetch a safe maxFeePerGas estimate.
 *
 * Uses eth_gasPrice and applies a 2× buffer to handle fee spikes between
 * quote time and block inclusion. For a more precise EIP-1559 base fee,
 * eth_feeHistory could be used, but eth_gasPrice is universally supported.
 */
async function getMaxFeePerGas(): Promise<string> {
  const gasPriceHex = await rpcCall<string>("eth_gasPrice", []);
  // Parse hex string to number, multiply by 2, re-encode as hex.
  // Avoid BigInt literals (n suffix) to stay within ES2017 target.
  const gasPrice = parseInt(gasPriceHex, 16);
  const buffered = gasPrice * 2;
  return "0x" + buffered.toString(16);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
