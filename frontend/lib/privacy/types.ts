/**
 * Privacy types for Railgun integration.
 *
 * Ported from Kohaku SDK (sources/kohaku-master).
 * Reference: railgun/lib/models/formatted-types.ts, account/keys.ts
 */

// ---------------------------------------------------------------------------
// Token types (from Kohaku formatted-types.ts)
// ---------------------------------------------------------------------------

export enum TokenType {
  ERC20 = 0,
  ERC721 = 1,
  ERC1155 = 2,
}

export interface TokenData {
  tokenType: TokenType;
  tokenAddress: string;
  tokenSubID: string;
}

// ---------------------------------------------------------------------------
// Key types
// ---------------------------------------------------------------------------

/** BabyJubJub BIP-32 key node (from Kohaku engine-types.ts) */
export interface KeyNode {
  chainKey: string;
  chainCode: string;
}

/** EdDSA spending public key on BabyJubJub curve — two field elements */
export type SpendingPublicKey = [bigint, bigint];

export interface SpendingKeyPair {
  privateKey: Uint8Array;
  pubkey: SpendingPublicKey;
}

export interface ViewingKeyPair {
  privateKey: Uint8Array;
  pubkey: Uint8Array;
}

/** Full set of Railgun keys derived from a mnemonic */
export interface RailgunKeys {
  /** BabyJubJub spending key pair */
  spending: SpendingKeyPair;
  /** Ed25519 viewing key pair */
  viewing: ViewingKeyPair;
  /** Poseidon(spendingPubKey[0], spendingPubKey[1], nullifyingKey) */
  masterPublicKey: bigint;
  /** Poseidon(viewingPrivateKey) — used for nullifier computation */
  nullifyingKey: bigint;
  /** Bech32m-encoded Railgun address (0zk...) */
  address: string;
}

// ---------------------------------------------------------------------------
// Shield types
// ---------------------------------------------------------------------------

/** AES-GCM ciphertext bundle */
export interface Ciphertext {
  iv: string;
  tag: string;
  data: string[];
}

/** AES-CTR ciphertext bundle */
export interface CiphertextCTR {
  iv: string;
  data: string[];
}

/** Shield ciphertext as expected by the RailgunSmartWallet contract */
export interface ShieldCiphertext {
  encryptedBundle: [string, string, string];
  shieldKey: string;
}

/** Commitment preimage for shield request */
export interface CommitmentPreimage {
  npk: string;
  token: TokenData;
  value: bigint;
}

/** Shield request struct matching RailgunSmartWallet.shield() ABI */
export interface ShieldRequest {
  preimage: CommitmentPreimage;
  ciphertext: ShieldCiphertext;
}

/** Parameters for building a shield transaction */
export interface ShieldParams {
  /** ERC-20 token address to shield (use ZERO_ADDRESS for native ETH) */
  tokenAddress: string;
  /** Amount in token's smallest unit (wei for ETH) */
  value: bigint;
  /** Master public key of the receiver (typically self) */
  masterPublicKey: bigint;
  /** Viewing public key of the receiver */
  viewingPublicKey: Uint8Array;
}

/** Result of building a shield transaction (unsigned) */
export interface ShieldTxData {
  to: string;
  data: string;
  value: bigint;
}

// ---------------------------------------------------------------------------
// Network config
// ---------------------------------------------------------------------------

export interface RailgunNetworkConfig {
  NAME: string;
  RAILGUN_ADDRESS: string;
  GLOBAL_START_BLOCK: number;
  CHAIN_ID: bigint;
  RELAY_ADAPT_ADDRESS: string;
  WETH: string;
  FEE_BASIS_POINTS: bigint;
}
