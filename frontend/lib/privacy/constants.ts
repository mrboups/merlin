/**
 * Railgun contract addresses and constants.
 *
 * Source of truth: sources/kohaku-master/.../config/mainnet.ts, sepolia.ts, constants.ts
 */

import type { RailgunNetworkConfig } from "./types";

// ---------------------------------------------------------------------------
// Network configs
// ---------------------------------------------------------------------------

export const MAINNET_CONFIG: RailgunNetworkConfig = {
  NAME: "mainnet",
  RAILGUN_ADDRESS: "0xFA7093CDD9EE6932B4eb2c9e1cde7CE00B1FA4b9",
  GLOBAL_START_BLOCK: 14693013,
  CHAIN_ID: 1n,
  RELAY_ADAPT_ADDRESS: "0x4025ee6512DBbda97049Bcf5AA5D38C54aF6bE8a",
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  FEE_BASIS_POINTS: 25n,
};

export const SEPOLIA_CONFIG: RailgunNetworkConfig = {
  NAME: "sepolia",
  RAILGUN_ADDRESS: "0x942D5026b421cf2705363A525897576cFAdA5964",
  GLOBAL_START_BLOCK: 4495479,
  CHAIN_ID: 11155111n,
  RELAY_ADAPT_ADDRESS: "0x66af65bfff9e384796a56f3fa3709b9d5d9d7083",
  WETH: "0x97a36608DA67AF0A79e50cb6343f86F340B3b49e",
  FEE_BASIS_POINTS: 25n,
};

/** Select network config by chain ID */
export function getNetworkConfig(chainId: bigint): RailgunNetworkConfig {
  switch (chainId) {
    case 1n:
      return MAINNET_CONFIG;
    case 11155111n:
      return SEPOLIA_CONFIG;
    default:
      throw new Error(`Unsupported Railgun chain ID: ${chainId}`);
  }
}

// ---------------------------------------------------------------------------
// Address constants
// ---------------------------------------------------------------------------

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const E_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

// ---------------------------------------------------------------------------
// Key derivation paths (BabyJubJub, hardened)
// ---------------------------------------------------------------------------

export const SPENDING_PATH_PREFIX = "m/44'/1984'/0'/0'/";
export const VIEWING_PATH_PREFIX = "m/420'/1984'/0'/0'/";

/** HMAC-SHA512 seed for BabyJubJub BIP-32 derivation */
export const BJJ_CURVE_SEED = "babyjubjub seed";

/** Token sub-ID for ERC-20 tokens (always zero) */
export const TOKEN_SUB_ID_NULL = "0x00";

/** Railgun address version */
export const ADDRESS_VERSION = 1;

/** Bech32m human-readable prefix */
export const ADDRESS_PREFIX = "0zk";

/** Max bech32m address length */
export const ADDRESS_LENGTH_LIMIT = 127;
