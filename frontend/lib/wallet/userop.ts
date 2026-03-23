/**
 * ERC-4337 v0.7 UserOperation signing and bundler submission.
 *
 * Implements the packed UserOp hash format required by EntryPoint v0.7
 * (0x0000000071727De22E5E9d8BAf0edAc6f37da032 — the canonical Ethereum
 * EntryPoint deployed post-Cancun).
 *
 * Hash algorithm per ERC-4337 v0.7:
 *
 *   accountGasLimits = pack128(verificationGasLimit, callGasLimit)
 *   gasFees          = pack128(maxPriorityFeePerGas, maxFeePerGas)
 *   paymasterAndData = paymaster || pack128(pmVerifGasLimit, pmPostOpGasLimit) || paymasterData
 *
 *   hashedOp = keccak256(abi.encode(
 *     sender,
 *     nonce,
 *     keccak256(initCode),
 *     keccak256(callData),
 *     accountGasLimits,   // bytes32
 *     preVerificationGas,
 *     gasFees,            // bytes32
 *     keccak256(paymasterAndData)
 *   ))
 *
 *   userOpHash = keccak256(abi.encode(hashedOp, entryPoint, chainId))
 *
 * No ethers.js, no web3.js. Only @noble/curves and @noble/hashes.
 * All ABI encoding is manual (fixed-width big-endian words).
 *
 * @noble/curves v2 API note:
 *   secp256k1.sign(hash, key, { format: 'recovered' }) → 65-byte Uint8Array
 *   Layout: recovery[1] || r[32] || s[32]
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * ERC-4337 EntryPoint v0.7 deployed address (canonical, all EVM chains).
 * Source: agents/ambire-7702.md
 */
export const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * ERC-4337 v0.7 PackedUserOperation.
 *
 * All numeric fields are 0x-prefixed hex strings (as returned by the backend
 * and as expected by the bundler JSON-RPC API).
 * The `signature` field starts as an empty string ("0x") and is filled in
 * by `signUserOp` before submission.
 */
export interface UserOperation {
  sender: string;
  nonce: string;
  /** initCode is empty ("0x") for existing accounts; non-empty only on first deployment. */
  initCode?: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  /** Paymaster address — omit or empty string if no paymaster. */
  paymaster?: string;
  /** Paymaster-specific data blob — appended after the gas limit pack. */
  paymasterData?: string;
  /** paymasterVerificationGasLimit as 0x-prefixed hex (uint128). */
  paymasterVerificationGasLimit?: string;
  /** paymasterPostOpGasLimit as 0x-prefixed hex (uint128). */
  paymasterPostOpGasLimit?: string;
  /** Signature — empty before signing, filled by signUserOp. */
  signature: string;
}

/**
 * Receipt returned by the bundler after a UserOperation is mined.
 */
export interface UserOpReceipt {
  /** Ethereum transaction hash that included this UserOperation. */
  transactionHash: string;
  /** true if the UserOperation executed without revert. */
  success: boolean;
  /**
   * Actual gas cost in wei (as 0x hex). This is the actual amount deducted
   * from the paymaster deposit (or the user's account for ETH gas).
   */
  actualGasCost: string;
}

// ---------------------------------------------------------------------------
// getUserOpHash
// ---------------------------------------------------------------------------

/**
 * Compute the ERC-4337 v0.7 UserOperation hash for signing.
 *
 * The result is the 32-byte hash that the account's `validateUserOp` function
 * expects the EOA/smart-account to have signed.
 *
 * @param userOp     The fully-populated UserOperation (signature field ignored)
 * @param entryPoint EntryPoint contract address (0x-prefixed, 20 bytes)
 * @param chainId    EIP-155 chain ID (integer)
 */
export function getUserOpHash(
  userOp: UserOperation,
  entryPoint: string,
  chainId: number
): Uint8Array {
  // -----------------------------------------------------------------
  // Step 1: Build paymasterAndData.
  //
  // If a paymaster is present:
  //   paymasterAndData = paymaster(20) || pmVerifGasLimit(16) || pmPostOpGasLimit(16) || paymasterData(variable)
  // Otherwise: empty bytes.
  // -----------------------------------------------------------------
  const paymasterAndData = buildPaymasterAndData(userOp);

  // -----------------------------------------------------------------
  // Step 2: Pack accountGasLimits and gasFees.
  //
  //   accountGasLimits = (verificationGasLimit << 128) | callGasLimit  → bytes32
  //   gasFees          = (maxPriorityFeePerGas << 128) | maxFeePerGas  → bytes32
  // -----------------------------------------------------------------
  const accountGasLimits = pack128Pair(
    userOp.verificationGasLimit,
    userOp.callGasLimit
  );
  const gasFees = pack128Pair(
    userOp.maxPriorityFeePerGas,
    userOp.maxFeePerGas
  );

  // -----------------------------------------------------------------
  // Step 3: abi.encode the packed UserOp fields and hash them.
  //
  //   encode(
  //     address sender,          // 32-byte word (left-padded 20-byte address)
  //     uint256 nonce,           // 32-byte word
  //     bytes32 keccak(initCode),
  //     bytes32 keccak(callData),
  //     bytes32 accountGasLimits,
  //     uint256 preVerificationGas,
  //     bytes32 gasFees,
  //     bytes32 keccak(paymasterAndData)
  //   )
  // -----------------------------------------------------------------
  const initCodeBytes = hexToBytes(userOp.initCode || "0x");
  const callDataBytes = hexToBytes(userOp.callData);

  const encodedOp = abiEncode([
    { type: "address", value: userOp.sender },
    { type: "uint256", value: userOp.nonce },
    { type: "bytes32", value: keccak_256(initCodeBytes) },
    { type: "bytes32", value: keccak_256(callDataBytes) },
    { type: "bytes32", value: accountGasLimits },
    { type: "uint256", value: userOp.preVerificationGas },
    { type: "bytes32", value: gasFees },
    { type: "bytes32", value: keccak_256(paymasterAndData) },
  ]);

  const hashedOp = keccak_256(encodedOp);

  // -----------------------------------------------------------------
  // Step 4: Hash (hashedOp, entryPoint, chainId) — the domain separator.
  //
  //   userOpHash = keccak256(abi.encode(bytes32 hashedOp, address entryPoint, uint256 chainId))
  // -----------------------------------------------------------------
  const domainEncoded = abiEncode([
    { type: "bytes32", value: hashedOp },
    { type: "address", value: entryPoint },
    { type: "uint256", value: "0x" + chainId.toString(16) },
  ]);

  return keccak_256(domainEncoded);
}

// ---------------------------------------------------------------------------
// signUserOp
// ---------------------------------------------------------------------------

/**
 * Sign a UserOperation with the user's private key.
 *
 * Computes the v0.7 UserOp hash, signs it with secp256k1, and returns
 * the 65-byte ECDSA signature packed as (r[32] || s[32] || v[1]) — the
 * standard Ethereum "ecrecover" format expected by AmbireAccount7702's
 * `validateUserOp` method.
 *
 * @param userOp     The UserOperation to sign (signature field is ignored)
 * @param entryPoint EntryPoint contract address
 * @param chainId    EIP-155 chain ID
 * @param privateKey Raw 32-byte secp256k1 private key from WalletManager
 * @returns          0x-prefixed 65-byte hex signature string
 */
export function signUserOp(
  userOp: UserOperation,
  entryPoint: string,
  chainId: number,
  privateKey: Uint8Array
): string {
  const hash = getUserOpHash(userOp, entryPoint, chainId);

  // secp256k1.sign with format:'recovered' → 65 bytes:
  //   [0]      = recovery bit (0 or 1)
  //   [1..32]  = r
  //   [33..64] = s
  const sig65 = secp256k1.sign(hash, privateKey, {
    lowS: true,
    format: "recovered",
  });

  const recoveryBit = sig65[0]; // 0 or 1
  const r = sig65.slice(1, 33);
  const s = sig65.slice(33, 65);

  // Pack as r || s || v (Ethereum convention: v = 27 + recoveryBit)
  // AmbireAccount7702 validateUserOp uses standard ecrecover so v must be 27/28.
  const v = 27 + recoveryBit;

  const sigBytes = new Uint8Array(65);
  sigBytes.set(r, 0);
  sigBytes.set(s, 32);
  sigBytes[64] = v;

  return "0x" + bytesToHex(sigBytes);
}

// ---------------------------------------------------------------------------
// submitUserOp
// ---------------------------------------------------------------------------

/**
 * Submit a signed UserOperation to a bundler via `eth_sendUserOperation`.
 *
 * The bundler validates the UserOp (signature, gas limits, paymaster) and
 * queues it for inclusion in the next block. Returns the UserOperation hash
 * as a 0x-prefixed hex string.
 *
 * @param userOp       Fully signed UserOperation (signature field must be set)
 * @param entryPoint   EntryPoint contract address
 * @param bundlerUrl   JSON-RPC endpoint of the bundler
 * @throws             On HTTP error, JSON-RPC error, or bundler rejection
 */
export async function submitUserOp(
  userOp: UserOperation,
  entryPoint: string,
  bundlerUrl: string
): Promise<string> {
  // Bundlers that follow ERC-4337 v0.7 expect the "packed" UserOp format:
  // { sender, nonce, initCode, callData, accountGasLimits, preVerificationGas,
  //   gasFees, paymasterAndData, signature }
  // We send the "expanded" format and let the bundler normalise — most modern
  // bundlers accept both. If a specific bundler requires packed format, the
  // transformation can be added here.
  const userOpHash = await bundlerRpcCall<string>(
    bundlerUrl,
    "eth_sendUserOperation",
    [userOp, entryPoint]
  );

  return userOpHash;
}

// ---------------------------------------------------------------------------
// waitForUserOpReceipt
// ---------------------------------------------------------------------------

/**
 * Poll the bundler for a UserOperation receipt.
 *
 * `eth_getUserOperationReceipt` returns null while the UserOp is pending.
 * We poll at `pollIntervalMs` until the receipt is available or `timeoutMs`
 * elapses.
 *
 * @param userOpHash     Hash returned by `eth_sendUserOperation`
 * @param bundlerUrl     Same bundler URL used for submission
 * @param timeoutMs      Maximum wait time (default: 120 seconds)
 * @param pollIntervalMs Polling interval (default: 4 seconds)
 * @throws               If the receipt is not available within `timeoutMs`
 */
export async function waitForUserOpReceipt(
  userOpHash: string,
  bundlerUrl: string,
  timeoutMs: number = 120_000,
  pollIntervalMs: number = 4_000
): Promise<UserOpReceipt> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const raw = await bundlerRpcCall<RawUserOpReceipt | null>(
      bundlerUrl,
      "eth_getUserOperationReceipt",
      [userOpHash]
    );

    if (raw !== null) {
      // `success` field: some bundlers return a boolean, others return "0x1"/"0x0"
      const success =
        typeof raw.success === "boolean"
          ? raw.success
          : raw.success === "0x1";

      return {
        transactionHash: raw.receipt?.transactionHash ?? raw.transactionHash ?? "",
        success,
        actualGasCost: raw.actualGasCost ?? "0x0",
      };
    }

    await delay(pollIntervalMs);
  }

  throw new Error(
    `UserOperation ${userOpHash} was not confirmed within ${timeoutMs / 1000}s — ` +
      `the bundler may still include it; check the transaction history before retrying`
  );
}

// ---------------------------------------------------------------------------
// ABI encoding helpers
// ---------------------------------------------------------------------------

/**
 * Minimal ABI encoder for a flat list of fixed-size types.
 *
 * Supported types: "address" (padded to 32 bytes), "uint256" (hex string → 32
 * bytes), "bytes32" (already 32 bytes or 32-byte hex string).
 *
 * This is sufficient for the two `abi.encode` calls in getUserOpHash.
 * Dynamic types (bytes, string, arrays) are intentionally not supported — they
 * are not needed here and adding them would require an offset table.
 */
type AbiWord =
  | { type: "address"; value: string }
  | { type: "uint256"; value: string } // 0x-prefixed hex
  | { type: "bytes32"; value: Uint8Array | string }; // 32-byte array or 0x hex

function abiEncode(words: AbiWord[]): Uint8Array {
  const out = new Uint8Array(words.length * 32);
  let offset = 0;

  for (const word of words) {
    const slot = out.subarray(offset, offset + 32);

    if (word.type === "address") {
      // address: zero-pad 20-byte address into the right 20 bytes of a 32-byte word.
      const addrBytes = hexToFixedBytes(word.value.replace(/^0x/i, ""), 20);
      slot.set(addrBytes, 12); // left 12 bytes remain zero
    } else if (word.type === "uint256") {
      // uint256: zero-pad integer hex into 32 bytes (big-endian).
      const hex = word.value.replace(/^0x/i, "") || "0";
      const padded = hex.length % 2 === 0 ? hex : "0" + hex;
      const bytes = hexStringToBytes(padded);
      if (bytes.length > 32) {
        throw new Error(`abiEncode: uint256 value overflows 32 bytes`);
      }
      slot.set(bytes, 32 - bytes.length); // right-align
    } else {
      // bytes32: treat as raw 32 bytes.
      if (word.value instanceof Uint8Array) {
        if (word.value.length !== 32) {
          throw new Error(
            `abiEncode: bytes32 value must be exactly 32 bytes, got ${word.value.length}`
          );
        }
        slot.set(word.value);
      } else {
        const hex = word.value.replace(/^0x/i, "");
        const bytes = hexToFixedBytes(hex, 32);
        slot.set(bytes);
      }
    }

    offset += 32;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Packing helpers (ERC-4337 v0.7 specific)
// ---------------------------------------------------------------------------

/**
 * Pack two uint128 values into a single bytes32 word.
 *
 * v0.7 packed format: high128 occupies bytes [0..15], low128 occupies [16..31].
 *
 *   result = (high128 << 128) | low128
 *
 * Both inputs are 0x-prefixed hex strings (as returned by the backend).
 */
function pack128Pair(high: string, low: string): Uint8Array {
  const result = new Uint8Array(32);
  const highBytes = hexToFixedBytes(high.replace(/^0x/i, "") || "0", 16);
  const lowBytes = hexToFixedBytes(low.replace(/^0x/i, "") || "0", 16);
  result.set(highBytes, 0);   // bytes [0..15]  — high128
  result.set(lowBytes, 16);   // bytes [16..31] — low128
  return result;
}

/**
 * Build the paymasterAndData blob for a UserOperation.
 *
 * v0.7 layout (if paymaster present):
 *   paymaster(20) || paymasterVerificationGasLimit(16) || paymasterPostOpGasLimit(16) || paymasterData(variable)
 *
 * Returns empty Uint8Array if no paymaster is configured.
 */
function buildPaymasterAndData(userOp: UserOperation): Uint8Array {
  if (!userOp.paymaster || userOp.paymaster === "0x") {
    return new Uint8Array(0);
  }

  const paymasterBytes = hexToFixedBytes(
    userOp.paymaster.replace(/^0x/i, ""),
    20
  );

  const pmVerifGasBytes = hexToFixedBytes(
    (userOp.paymasterVerificationGasLimit ?? "0x0").replace(/^0x/i, "") || "0",
    16
  );

  const pmPostOpGasBytes = hexToFixedBytes(
    (userOp.paymasterPostOpGasLimit ?? "0x0").replace(/^0x/i, "") || "0",
    16
  );

  const pmDataBytes = hexToBytes(userOp.paymasterData ?? "0x");

  const total =
    paymasterBytes.length +
    pmVerifGasBytes.length +
    pmPostOpGasBytes.length +
    pmDataBytes.length;

  const out = new Uint8Array(total);
  let pos = 0;
  out.set(paymasterBytes, pos);   pos += paymasterBytes.length;
  out.set(pmVerifGasBytes, pos);  pos += pmVerifGasBytes.length;
  out.set(pmPostOpGasBytes, pos); pos += pmPostOpGasBytes.length;
  out.set(pmDataBytes, pos);

  return out;
}

// ---------------------------------------------------------------------------
// Bundler JSON-RPC client
// ---------------------------------------------------------------------------

interface BundlerRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

/** Raw shape of eth_getUserOperationReceipt result (varies across bundlers). */
interface RawUserOpReceipt {
  /** Some bundlers nest the L1 receipt here. */
  receipt?: { transactionHash: string };
  /** Some bundlers hoist transactionHash to the top level. */
  transactionHash?: string;
  /** Boolean or "0x1"/"0x0" depending on the bundler implementation. */
  success: boolean | string;
  /** Actual gas cost in wei, 0x-prefixed hex. */
  actualGasCost?: string;
}

let _bundlerRpcId = 1;

/**
 * Make a JSON-RPC call to the bundler endpoint.
 *
 * Bundler errors use a non-standard error format (ERC-4337 Appendix A) —
 * this function surfaces both the code and message so callers can distinguish
 * rejection reasons (signature failure, gas too low, paymaster reject, etc.).
 */
async function bundlerRpcCall<T>(
  bundlerUrl: string,
  method: string,
  params: unknown[]
): Promise<T> {
  const id = _bundlerRpcId++;

  let response: Response;
  try {
    response = await fetch(bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Bundler RPC network error (${method}): ${msg}`);
  }

  if (!response.ok) {
    throw new Error(
      `Bundler RPC HTTP ${response.status} ${response.statusText} for method ${method}`
    );
  }

  const json: BundlerRpcResponse<T> = await response.json();

  if (json.error) {
    // ERC-4337 bundler rejection codes:
    //  -32500: transaction rejected by EntryPoint's simulateValidation
    //  -32501: transaction rejected by paymaster's validatePaymasterUserOp
    //  -32502: transaction rejected because of opcode violation
    //  -32521: transaction rejected because of insufficient gas
    const detail =
      json.error.data !== undefined
        ? `${json.error.message} (data: ${JSON.stringify(json.error.data)})`
        : json.error.message;
    throw new Error(`Bundler error ${json.error.code}: ${detail}`);
  }

  if (json.result === undefined && method !== "eth_getUserOperationReceipt") {
    throw new Error(`Bundler RPC returned no result for method ${method}`);
  }

  return json.result as T;
}

// ---------------------------------------------------------------------------
// Low-level byte utilities (local — mirrors transaction.ts without exporting)
// ---------------------------------------------------------------------------

/** Convert a 0x-prefixed (or bare) hex string to a Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (h === "") return new Uint8Array(0);
  const padded = h.length % 2 === 0 ? h : "0" + h;
  return hexStringToBytes(padded);
}

/**
 * Convert a hex string (no 0x prefix) to exactly `size` bytes.
 * Right-aligns the bytes, zero-padding on the left.
 * Throws if the hex decodes to more bytes than `size`.
 */
function hexToFixedBytes(hex: string, size: number): Uint8Array {
  const padded = hex.length % 2 === 0 ? hex : "0" + hex;
  const raw = hexStringToBytes(padded);
  if (raw.length > size) {
    throw new Error(
      `hexToFixedBytes: value (${raw.length} bytes) exceeds target size (${size} bytes)`
    );
  }
  const out = new Uint8Array(size);
  out.set(raw, size - raw.length); // right-align
  return out;
}

/** Parse a lowercase even-length hex string to bytes. */
function hexStringToBytes(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

/** Convert a Uint8Array to a lowercase hex string (no 0x prefix). */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
