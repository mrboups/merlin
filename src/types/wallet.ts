import type { BlockchainId, Hex, TransactionResult, ModuleConfig } from './common.js';

/**
 * Configuration for registering a wallet module
 */
export interface WalletModuleConfig extends ModuleConfig {
  /** RPC endpoint URL */
  rpcUrl: string;
  /** Chain ID (for EVM chains) */
  chainId?: number;
  /** Additional chain-specific configuration */
  chainConfig?: Record<string, unknown>;
}

/**
 * A derived wallet account that can sign and send transactions
 */
export interface IWalletAccount {
  /** The blockchain this account belongs to */
  readonly blockchain: BlockchainId;
  /** The derivation index of this account */
  readonly index: number;
  /** Get the public address of this account */
  getAddress(): Promise<Hex>;
  /** Sign arbitrary message bytes */
  signMessage(message: Uint8Array): Promise<Hex>;
  /** Send a raw transaction */
  sendTransaction(tx: TransactionParams): Promise<TransactionResult>;
  /** Get the balance of the native token */
  getBalance(): Promise<bigint>;
}

/**
 * Parameters for constructing a transaction
 */
export interface TransactionParams {
  /** Recipient address */
  to: Hex;
  /** Value in base units (wei for EVM) */
  value?: bigint;
  /** Encoded calldata */
  data?: Hex;
  /** Gas limit override */
  gasLimit?: bigint;
}

/**
 * Interface that wallet manager implementations must satisfy.
 * Each supported blockchain provides its own WalletManager implementation.
 */
export interface IWalletManager {
  /** Create or derive an account at the given BIP-44 index */
  getAccount(index: number): Promise<IWalletAccount>;
  /** Create or derive an account at the given BIP-44 path */
  getAccountByPath(path: string): Promise<IWalletAccount>;
  /** Get current fee rates for this chain */
  getFeeRates(): Promise<FeeRates>;
  /** Securely dispose of seed material */
  dispose(): void;
}

/**
 * Fee rate information for a blockchain
 */
export interface FeeRates {
  /** Slow confirmation fee (in base units) */
  slow: bigint;
  /** Standard confirmation fee */
  standard: bigint;
  /** Fast confirmation fee */
  fast: bigint;
}

/**
 * Constructor type for wallet manager classes
 */
export type WalletManagerConstructor = new (
  seed: string | Uint8Array,
  config: WalletModuleConfig,
) => IWalletManager;
