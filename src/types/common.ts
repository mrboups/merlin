/**
 * Hex-encoded string with 0x prefix
 */
export type Hex = `0x${string}`;

/**
 * Supported blockchain identifiers
 */
export type BlockchainId = string;

/**
 * Network chain IDs for EVM-compatible chains
 */
export type ChainId = number;

/**
 * Token address — the contract address of an ERC-20 token, or a native token sentinel
 */
export type TokenAddress = Hex;

/**
 * A BIP-39 mnemonic seed phrase
 */
export type SeedPhrase = string;

/**
 * Raw seed bytes
 */
export type SeedBytes = Uint8Array;

/**
 * Seed input — either a mnemonic phrase or raw bytes
 */
export type SeedInput = SeedPhrase | SeedBytes;

/**
 * Result of a submitted transaction
 */
export interface TransactionResult {
  /** Transaction hash */
  hash: Hex;
  /** Fee paid (in base units of the native token) */
  fee: bigint;
  /** Block number where the transaction was included (available after confirmation) */
  blockNumber?: number;
}

/**
 * Base configuration that all modules receive
 */
export interface ModuleConfig {
  /** Optional debug/logging flag */
  debug?: boolean;
}

/**
 * Error types emitted by the SDK
 */
export enum MerlinErrorCode {
  INVALID_SEED = 'INVALID_SEED',
  WALLET_NOT_REGISTERED = 'WALLET_NOT_REGISTERED',
  PROVIDER_NOT_CONFIGURED = 'PROVIDER_NOT_CONFIGURED',
  PRIVACY_PROTOCOL_ERROR = 'PRIVACY_PROTOCOL_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  UNSUPPORTED_CHAIN = 'UNSUPPORTED_CHAIN',
}

/**
 * Structured error class for the SDK
 */
export class MerlinError extends Error {
  public readonly code: MerlinErrorCode;
  public readonly context?: Record<string, unknown>;

  constructor(code: MerlinErrorCode, message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'MerlinError';
    this.code = code;
    this.context = context;
  }
}
