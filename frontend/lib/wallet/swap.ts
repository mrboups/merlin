/**
 * High-level swap orchestration for Merlin.
 *
 * Coordinates the full swap lifecycle:
 *   1. Get a quote from the backend
 *   2. If ERC-20 approval is required, sign and submit the approval tx
 *   3. Sign and submit the swap tx
 *   4. Wait for on-chain confirmation
 *   5. Report the result back to the backend
 *
 * Progress is streamed via an `onProgress` callback so the UI can reflect
 * each stage without coupling the swap logic to any React state.
 */

import { apiClient } from "@/lib/api";
import {
  signTransaction,
  sendRawTransaction,
  waitForReceipt,
  type UnsignedTx,
} from "./transaction";
import { signEIP7702Auth, type EIP7702Authorization } from "./eip7702";
import {
  signUserOp,
  submitUserOp,
  waitForUserOpReceipt,
  ENTRY_POINT_V07,
  type UserOperation,
} from "./userop";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Swap quote returned by the backend's /trade/quote endpoint.
 */
export interface SwapQuote {
  quote_id: string;
  token_in: { symbol: string; address: string; decimals: number };
  token_out: { symbol: string; address: string; decimals: number };
  /** Human-readable amount being spent */
  amount_in: string;
  /** Expected human-readable amount to receive */
  amount_out: string;
  /** Whether an ERC-20 approval transaction must be submitted first */
  needs_approval: boolean;
  /** Unsigned approval tx — only present when needs_approval is true */
  approval_tx: UnsignedTx | null;
  /** Unsigned swap tx — always present */
  swap_tx: UnsignedTx;
  /** ISO-8601 timestamp after which this quote is no longer valid */
  expires_at: string;
}

/**
 * Discrete states in the swap lifecycle.
 *
 * The UI should render a distinct message for each state.
 */
export type SwapStatus =
  | "quoting"
  | "approving"
  | "swapping"
  | "confirming"
  | "confirmed"
  | "failed";

/**
 * A progress snapshot emitted by `executeSwap` at each stage transition.
 */
export interface SwapProgress {
  status: SwapStatus;
  message: string;
  /** Only present once the transaction has been broadcast */
  txHash?: string;
}

// ---------------------------------------------------------------------------
// executeSwap
// ---------------------------------------------------------------------------

/**
 * Execute a complete token swap.
 *
 * @param tokenIn       Symbol or address of the token to sell (e.g. "USDC")
 * @param tokenOut      Symbol or address of the token to buy (e.g. "TSLA")
 * @param amount        Amount to trade
 * @param amountType    Whether `amount` is a USD value or a token quantity
 * @param privateKey    Raw 32-byte secp256k1 private key from WalletManager
 * @param onProgress    Callback invoked at every stage transition
 * @param slippage      Maximum acceptable slippage percentage (default: 0.5%)
 *
 * @returns The final transaction hash and a success flag.
 * @throws  On network errors, RPC failures, or if the backend quote fails.
 *          If an approval or swap tx reverts, the function returns
 *          `{ txHash, success: false }` rather than throwing.
 */
export async function executeSwap(
  tokenIn: string,
  tokenOut: string,
  amount: number,
  amountType: "usd" | "quantity",
  privateKey: Uint8Array,
  onProgress: (progress: SwapProgress) => void,
  slippage: number = 0.5
): Promise<{ txHash: string; success: boolean }> {
  // ------------------------------------------------------------------
  // Step 1: Fetch a quote from the backend.
  // ------------------------------------------------------------------
  onProgress({ status: "quoting", message: "Getting swap quote..." });

  const quoteRes = await apiClient.post<SwapQuote>("/trade/quote", {
    token_in: tokenIn,
    token_out: tokenOut,
    amount,
    amount_type: amountType,
    slippage,
  });

  if (quoteRes.error || !quoteRes.data) {
    throw new Error(quoteRes.error ?? "Failed to get swap quote from backend");
  }

  const quote = quoteRes.data;

  // Sanity-check: reject expired quotes before touching keys.
  const expiresAt = new Date(quote.expires_at).getTime();
  if (Date.now() > expiresAt) {
    throw new Error(
      `Swap quote expired at ${quote.expires_at} — please retry`
    );
  }

  // ------------------------------------------------------------------
  // Step 2: ERC-20 approval (only if the backend says it's needed).
  // ------------------------------------------------------------------
  if (quote.needs_approval && quote.approval_tx) {
    onProgress({
      status: "approving",
      message: `Approving ${quote.token_in.symbol} spending...`,
    });

    const signedApproval = await signTransaction(quote.approval_tx, privateKey);
    const approvalHash = await sendRawTransaction(signedApproval.rawTransaction);

    // Wait for approval to be mined before attempting the swap.
    const approvalReceipt = await waitForReceipt(approvalHash);
    if (!approvalReceipt.status) {
      // The approval itself reverted — no point submitting the swap.
      throw new Error(
        `Approval transaction reverted on-chain (hash: ${approvalHash})`
      );
    }
  }

  // ------------------------------------------------------------------
  // Step 3: Sign and broadcast the swap transaction.
  // ------------------------------------------------------------------
  onProgress({
    status: "swapping",
    message: `Swapping ${quote.amount_in} ${quote.token_in.symbol} for ~${quote.amount_out} ${quote.token_out.symbol}...`,
  });

  const signedSwap = await signTransaction(quote.swap_tx, privateKey);
  const txHash = await sendRawTransaction(signedSwap.rawTransaction);

  // ------------------------------------------------------------------
  // Step 4: Wait for the swap to be confirmed on-chain.
  // ------------------------------------------------------------------
  onProgress({
    status: "confirming",
    message: "Waiting for confirmation...",
    txHash,
  });

  const receipt = await waitForReceipt(txHash);

  // ------------------------------------------------------------------
  // Step 5: Report the outcome to the backend.
  //         This is fire-and-forget — a failure here should not surface
  //         as a swap error since the on-chain state is already final.
  // ------------------------------------------------------------------
  apiClient
    .post("/trade/confirm", {
      quote_id: quote.quote_id,
      tx_hash: txHash,
      success: receipt.status,
    })
    .catch((e: unknown) => {
      console.warn("[swap] Failed to report trade confirmation to backend:", e);
    });

  if (receipt.status) {
    onProgress({
      status: "confirmed",
      message: `Swap confirmed: ${quote.amount_in} ${quote.token_in.symbol} → ${quote.amount_out} ${quote.token_out.symbol}`,
      txHash,
    });
    return { txHash, success: true };
  } else {
    onProgress({
      status: "failed",
      message: "Transaction reverted on-chain. No funds were exchanged.",
      txHash,
    });
    return { txHash, success: false };
  }
}

// ---------------------------------------------------------------------------
// Gasless swap types
// ---------------------------------------------------------------------------

/**
 * Gasless swap quote returned by `/trade/quote-gasless`.
 *
 * Contains the same token / amount summary as SwapQuote plus an unsigned
 * UserOperation pre-built by the backend (with paymaster data already
 * attached) and an optional EIP-7702 authorization to sign for first-time
 * delegation.
 */
export interface GaslessSwapQuote {
  quote_id: string;
  token_in: { symbol: string; address: string; decimals: number };
  token_out: { symbol: string; address: string; decimals: number };
  /** Human-readable amount being spent (e.g. "10.00"). */
  amount_in: string;
  /** Expected human-readable amount to receive. */
  amount_out: string;
  /** Unsigned ERC-4337 v0.7 UserOperation with paymaster data filled in. */
  user_operation: UserOperation;
  /**
   * EntryPoint address — should equal ENTRY_POINT_V07 but the backend owns
   * this value to allow future upgrades without a frontend deploy.
   */
  entrypoint: string;
  /** JSON-RPC endpoint of the bundler to submit to. */
  bundler_url: string;
  /**
   * EIP-7702 authorization to sign — only present if this is the user's first
   * gasless transaction (the EOA has not yet delegated to AmbireAccount7702).
   * The frontend must sign this and include it in the UserOperation before
   * submission (the backend expects it back in the /trade/confirm call).
   */
  eip7702_auth?: EIP7702Authorization;
  /** Chain ID — used when signing the UserOperation. */
  chain_id: number;
  /** ISO-8601 timestamp after which this quote is no longer valid. */
  expires_at: string;
}

// ---------------------------------------------------------------------------
// executeGaslessSwap
// ---------------------------------------------------------------------------

/**
 * Execute a gasless token swap using EIP-7702 + AmbirePaymaster (USDC gas).
 *
 * The user never needs ETH in their wallet — gas is deducted from their USDC
 * balance by the paymaster. This requires:
 *   - The user's EOA to have sufficient USDC for both the swap and the gas fee
 *   - The backend to have pre-built the UserOperation with paymaster data
 *
 * On the user's first gasless transaction, the EOA must sign an EIP-7702
 * authorization to activate the AmbireAccount7702 delegation. Subsequent
 * transactions skip this step (the delegation persists on-chain).
 *
 * Flow:
 *   1. Fetch gasless quote from backend (/trade/quote-gasless)
 *   2. Validate quote (not expired, entrypoint matches expected)
 *   3. If eip7702_auth present: sign EIP-7702 authorization (first-time delegation)
 *   4. Sign UserOperation with the user's private key
 *   5. Submit signed UserOp to the bundler
 *   6. Poll for UserOp receipt
 *   7. Report outcome to backend (/trade/confirm)
 *
 * @param tokenIn      Symbol or address of the token to sell (e.g. "USDC")
 * @param tokenOut     Symbol or address of the token to buy (e.g. "TSLA")
 * @param amount       Amount to trade
 * @param amountType   Whether `amount` is a USD value or a token quantity
 * @param privateKey   Raw 32-byte secp256k1 private key from WalletManager
 * @param onProgress   Callback invoked at every stage transition
 * @param slippage     Maximum acceptable slippage percentage (default: 0.5%)
 *
 * @returns The UserOperation transaction hash and a success flag.
 * @throws  On network errors, bundler rejection, or backend quota failure.
 *          If the bundler confirms the tx but the UserOp reverted, the
 *          function returns `{ txHash, success: false }` rather than throwing.
 */
export async function executeGaslessSwap(
  tokenIn: string,
  tokenOut: string,
  amount: number,
  amountType: "usd" | "quantity",
  privateKey: Uint8Array,
  onProgress: (progress: SwapProgress) => void,
  slippage: number = 0.5
): Promise<{ txHash: string; success: boolean }> {
  // ------------------------------------------------------------------
  // Step 1: Fetch a gasless quote from the backend.
  // ------------------------------------------------------------------
  onProgress({ status: "quoting", message: "Getting gasless swap quote..." });

  const quoteRes = await apiClient.post<GaslessSwapQuote>(
    "/trade/quote-gasless",
    {
      token_in: tokenIn,
      token_out: tokenOut,
      amount,
      amount_type: amountType,
      slippage,
    }
  );

  if (quoteRes.error || !quoteRes.data) {
    throw new Error(
      quoteRes.error ?? "Failed to get gasless swap quote from backend"
    );
  }

  const quote = quoteRes.data;

  // Reject expired quotes before touching key material.
  const expiresAt = new Date(quote.expires_at).getTime();
  if (Date.now() > expiresAt) {
    throw new Error(
      `Gasless swap quote expired at ${quote.expires_at} — please retry`
    );
  }

  // Sanity-check the entrypoint address so we never sign for an unexpected
  // EntryPoint (e.g. a misconfigured backend pointing at a wrong network).
  if (
    quote.entrypoint.toLowerCase() !== ENTRY_POINT_V07.toLowerCase()
  ) {
    throw new Error(
      `Gasless quote uses unexpected EntryPoint ${quote.entrypoint} ` +
        `(expected ${ENTRY_POINT_V07}) — aborting to protect funds`
    );
  }

  // ------------------------------------------------------------------
  // Step 2: Sign EIP-7702 authorization (only on first delegation).
  // ------------------------------------------------------------------
  let signedAuth: ReturnType<typeof signEIP7702Auth> | null = null;

  if (quote.eip7702_auth) {
    onProgress({
      status: "approving",
      message: "Activating smart account (one-time setup)...",
    });

    signedAuth = signEIP7702Auth(quote.eip7702_auth, privateKey);

    // Embed the signed authorization into the UserOperation.
    // The backend built the UserOp expecting this — it will be included in
    // the /trade/confirm call so the bundler/relayer can package it into a
    // Type 4 transaction that wraps the UserOp.
    // We attach it as a non-standard field so the submission payload carries
    // it through to waitForUserOpReceipt without mutating the core UserOp fields.
    (quote.user_operation as UserOperation & { _eip7702Auth?: unknown })._eip7702Auth =
      signedAuth;
  }

  // ------------------------------------------------------------------
  // Step 3: Sign the UserOperation.
  // ------------------------------------------------------------------
  onProgress({ status: "swapping", message: "Signing transaction..." });

  const chainId = quote.chain_id;
  const signature = signUserOp(
    quote.user_operation,
    quote.entrypoint,
    chainId,
    privateKey
  );

  // Attach signature to the UserOp — submitUserOp sends the full object.
  const signedUserOp: UserOperation = {
    ...quote.user_operation,
    signature,
  };

  // ------------------------------------------------------------------
  // Step 4: Submit to the bundler.
  // ------------------------------------------------------------------
  onProgress({ status: "swapping", message: "Submitting to network..." });

  let userOpHash: string;
  try {
    userOpHash = await submitUserOp(
      signedUserOp,
      quote.entrypoint,
      quote.bundler_url
    );
  } catch (bundlerErr) {
    // Surface bundler rejection clearly — common causes: gas too low,
    // paymaster rejected (insufficient USDC), stale nonce.
    const msg =
      bundlerErr instanceof Error ? bundlerErr.message : String(bundlerErr);
    throw new Error(`Bundler rejected UserOperation: ${msg}`);
  }

  // ------------------------------------------------------------------
  // Step 5: Wait for confirmation.
  // ------------------------------------------------------------------
  onProgress({
    status: "confirming",
    message: "Waiting for confirmation...",
  });

  const receipt = await waitForUserOpReceipt(
    userOpHash,
    quote.bundler_url,
    120_000,
    4_000
  );

  // ------------------------------------------------------------------
  // Step 6: Report outcome to backend (fire-and-forget).
  //
  // Failure here must not surface as a swap error — the on-chain state
  // is already final. The backend can reconcile from on-chain events.
  // ------------------------------------------------------------------
  apiClient
    .post("/trade/confirm", {
      quote_id: quote.quote_id,
      tx_hash: receipt.transactionHash,
      success: receipt.success,
      ...(signedAuth ? { eip7702_auth: signedAuth } : {}),
    })
    .catch((e: unknown) => {
      console.warn(
        "[swap] Failed to report gasless trade confirmation to backend:",
        e
      );
    });

  if (receipt.success) {
    onProgress({
      status: "confirmed",
      message: `Swap confirmed: ${quote.amount_in} ${quote.token_in.symbol} → ${quote.amount_out} ${quote.token_out.symbol}`,
      txHash: receipt.transactionHash,
    });
    return { txHash: receipt.transactionHash, success: true };
  } else {
    onProgress({
      status: "failed",
      message:
        "UserOperation included in a block but the execution reverted. No funds were exchanged.",
      txHash: receipt.transactionHash,
    });
    return { txHash: receipt.transactionHash, success: false };
  }
}
