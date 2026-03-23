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
