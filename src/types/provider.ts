import type { Hex, ModuleConfig } from './common.js';

/**
 * Supported provider backends
 */
export enum ProviderBackend {
  ETHERS = 'ethers',
  VIEM = 'viem',
  RPC = 'rpc',
}

/**
 * Configuration for the provider module
 */
export interface ProviderModuleConfig extends ModuleConfig {
  /** Default backend to use when creating providers */
  defaultBackend?: ProviderBackend;
}

/**
 * Chain-specific RPC configuration
 */
export interface ChainRpcConfig {
  /** Primary RPC URL */
  url: string;
  /** Fallback RPC URLs (tried in order if primary fails) */
  fallbacks?: string[];
  /** Chain ID */
  chainId: number;
  /** Human-readable chain name */
  name: string;
  /** Whether this is a testnet */
  testnet?: boolean;
}

/**
 * Abstraction over different Ethereum provider libraries.
 * Allows the SDK to work with ethers.js, viem, or raw JSON-RPC interchangeably.
 */
export interface IProvider {
  /** Get the current block number */
  getBlockNumber(): Promise<number>;
  /** Get the balance of an address */
  getBalance(address: Hex): Promise<bigint>;
  /** Call a contract (read-only) */
  call(tx: { to: Hex; data: Hex }): Promise<Hex>;
  /** Send a signed transaction */
  sendRawTransaction(signedTx: Hex): Promise<Hex>;
  /** Get a transaction receipt */
  getTransactionReceipt(hash: Hex): Promise<TransactionReceipt | null>;
  /** Get the current gas price */
  getGasPrice(): Promise<bigint>;
  /** Estimate gas for a transaction */
  estimateGas(tx: { to: Hex; data?: Hex; value?: bigint }): Promise<bigint>;
}

/**
 * Transaction receipt
 */
export interface TransactionReceipt {
  hash: Hex;
  blockNumber: number;
  status: 'success' | 'reverted';
  gasUsed: bigint;
}
