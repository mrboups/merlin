import type { Hex, TokenAddress } from '../../types/common.js';

/**
 * The type of transaction flow
 */
export enum TransactionMode {
  /** Standard public transaction */
  PUBLIC = 'public',
  /** Shielded transaction through a privacy protocol */
  SHIELDED = 'shielded',
}

/**
 * High-level transaction request that the TransactionService routes
 * to the appropriate module (wallet for public, privacy for shielded).
 */
export interface TransactionRequest {
  /** Which mode to use */
  mode: TransactionMode;
  /** Source blockchain identifier */
  blockchain: string;
  /** Chain ID (for EVM) */
  chainId: number;
  /** Account index to use as sender */
  accountIndex?: number;
  /** Recipient address (public) or shielded address */
  to: string;
  /** Token to transfer (native token if omitted) */
  token?: TokenAddress;
  /** Amount in base units */
  amount: bigint;
  /** Optional calldata for contract interactions */
  data?: Hex;
}

/**
 * Unified result for any transaction, public or private
 */
export interface UnifiedTransactionResult {
  /** Transaction hash */
  hash: Hex;
  /** Fee paid */
  fee: bigint;
  /** The mode used */
  mode: TransactionMode;
  /** Whether the transaction has been confirmed */
  confirmed: boolean;
}
