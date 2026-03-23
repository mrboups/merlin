import type { Hex, TokenAddress, ModuleConfig } from './common.js';
import type { IWalletAccount } from './wallet.js';

/**
 * Supported privacy protocol identifiers
 */
export enum PrivacyProtocol {
  RAILGUN = 'railgun',
  PRIVACY_POOLS = 'privacy-pools',
}

/**
 * Configuration for initializing a privacy module
 */
export interface PrivacyModuleConfig extends ModuleConfig {
  /** Which privacy protocol to use */
  protocol: PrivacyProtocol;
  /** Chain ID for the privacy contracts */
  chainId: number;
  /** RPC endpoint for interacting with privacy contracts */
  rpcUrl: string;
  /** Optional: path for local encrypted storage of privacy state (merkle trees, notes) */
  storagePath?: string;
}

/**
 * A shielded (private) balance entry
 */
export interface ShieldedBalance {
  /** Token contract address */
  token: TokenAddress;
  /** Shielded balance in base units */
  balance: bigint;
  /** Human-readable token symbol (if resolved) */
  symbol?: string;
  /** Token decimals (if resolved) */
  decimals?: number;
}

/**
 * Parameters for shielding tokens (public -> private)
 */
export interface ShieldParams {
  /** Token to shield */
  token: TokenAddress;
  /** Amount in base units */
  amount: bigint;
  /** The public account funding the shield */
  fromAccount: IWalletAccount;
}

/**
 * Parameters for unshielding tokens (private -> public)
 */
export interface UnshieldParams {
  /** Token to unshield */
  token: TokenAddress;
  /** Amount in base units */
  amount: bigint;
  /** Public address to receive the unshielded tokens */
  toAddress: Hex;
}

/**
 * Parameters for a private transfer (private -> private)
 */
export interface PrivateTransferParams {
  /** Token to transfer */
  token: TokenAddress;
  /** Amount in base units */
  amount: bigint;
  /** Recipient's shielded address (Railgun 0zk address) */
  toShieldedAddress: string;
}

/**
 * Result of a privacy operation (shield, unshield, private transfer)
 */
export interface PrivacyTransactionResult {
  /** Transaction hash on the base layer */
  hash: Hex;
  /** Fee paid */
  fee: bigint;
  /** Whether the transaction is confirmed */
  confirmed: boolean;
}

/**
 * Interface for privacy protocol implementations
 */
export interface IPrivacyProvider {
  /** Initialize the privacy provider (load circuits, sync state, etc.) */
  initialize(): Promise<void>;
  /** Get the shielded address for this account */
  getShieldedAddress(): Promise<string>;
  /** Get all shielded balances */
  getShieldedBalances(): Promise<ShieldedBalance[]>;
  /** Shield tokens from a public account into the private pool */
  shield(params: ShieldParams): Promise<PrivacyTransactionResult>;
  /** Unshield tokens from the private pool to a public address */
  unshield(params: UnshieldParams): Promise<PrivacyTransactionResult>;
  /** Transfer tokens privately between shielded addresses */
  privateTransfer(params: PrivateTransferParams): Promise<PrivacyTransactionResult>;
  /** Sync the local state (scan for new notes, update merkle tree) */
  sync(): Promise<void>;
  /** Dispose of sensitive data */
  dispose(): void;
}
