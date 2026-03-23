import { MerlinError, MerlinErrorCode } from '../../types/common.js';
import type {
  BlockchainId,
  SeedInput,
  IWalletAccount,
  IWalletManager,
  WalletModuleConfig,
  WalletManagerConstructor,
  FeeRates,
} from './wallet.types.js';

/**
 * WalletService manages registered wallet implementations across multiple blockchains.
 * It handles seed validation, wallet lifecycle, and account derivation.
 *
 * Modeled after the WDK pattern: register wallet managers per chain, derive accounts by index or path.
 */
export class WalletService {
  private readonly seed: SeedInput;
  private readonly wallets: Map<BlockchainId, IWalletManager> = new Map();

  constructor(seed: SeedInput) {
    if (!WalletService.isValidSeed(seed)) {
      throw new MerlinError(
        MerlinErrorCode.INVALID_SEED,
        'Provided seed is not a valid BIP-39 mnemonic or seed bytes',
        { seedType: typeof seed },
      );
    }
    this.seed = seed;
  }

  /**
   * Validate a seed input. Accepts either:
   * - A BIP-39 mnemonic string (12 or 24 words)
   * - A Uint8Array of 16-64 bytes
   */
  static isValidSeed(seed: SeedInput): boolean {
    if (seed instanceof Uint8Array) {
      return seed.length >= 16 && seed.length <= 64;
    }
    if (typeof seed === 'string') {
      const words = seed.trim().split(/\s+/);
      return words.length === 12 || words.length === 24;
    }
    return false;
  }

  /**
   * Register a wallet manager for a specific blockchain.
   * The WalletManager class is instantiated with the seed and provided config.
   */
  registerWallet(
    blockchain: BlockchainId,
    WalletManager: WalletManagerConstructor,
    config: WalletModuleConfig,
  ): this {
    const manager = new WalletManager(this.seed, config);
    this.wallets.set(blockchain, manager);
    return this;
  }

  /**
   * Derive an account at the given BIP-44 index for a registered blockchain.
   */
  async getAccount(blockchain: BlockchainId, index: number = 0): Promise<IWalletAccount> {
    const manager = this.getManager(blockchain);
    return manager.getAccount(index);
  }

  /**
   * Derive an account at the given BIP-44 derivation path for a registered blockchain.
   */
  async getAccountByPath(blockchain: BlockchainId, path: string): Promise<IWalletAccount> {
    const manager = this.getManager(blockchain);
    return manager.getAccountByPath(path);
  }

  /**
   * Get current fee rates for a registered blockchain.
   */
  async getFeeRates(blockchain: BlockchainId): Promise<FeeRates> {
    const manager = this.getManager(blockchain);
    return manager.getFeeRates();
  }

  /**
   * Check if a wallet is registered for a given blockchain.
   */
  hasWallet(blockchain: BlockchainId): boolean {
    return this.wallets.has(blockchain);
  }

  /**
   * Get all registered blockchain identifiers.
   */
  getRegisteredBlockchains(): BlockchainId[] {
    return Array.from(this.wallets.keys());
  }

  /**
   * Dispose all wallet managers, securely erasing seed material.
   */
  dispose(): void {
    for (const [, manager] of this.wallets) {
      manager.dispose();
    }
    this.wallets.clear();
  }

  private getManager(blockchain: BlockchainId): IWalletManager {
    const manager = this.wallets.get(blockchain);
    if (!manager) {
      throw new MerlinError(
        MerlinErrorCode.WALLET_NOT_REGISTERED,
        `No wallet registered for blockchain: ${blockchain}`,
        { blockchain, registered: this.getRegisteredBlockchains() },
      );
    }
    return manager;
  }
}
