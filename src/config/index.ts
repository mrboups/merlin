import type { ChainRpcConfig } from '../modules/provider/index.js';

/**
 * Top-level configuration for the Merlin SDK.
 */
export interface MerlinConfig {
  /** BIP-39 mnemonic or raw seed bytes */
  seed: string | Uint8Array;
  /** Chain RPC configurations to register on init */
  chains?: ChainRpcConfig[];
  /** Enable debug logging */
  debug?: boolean;
}
