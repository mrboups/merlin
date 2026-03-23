import type { MerlinConfig } from './config/index.js';
import { WalletService } from './modules/wallet/index.js';
import { ProviderService } from './modules/provider/index.js';
import { PrivacyService } from './modules/privacy/index.js';
import { TransactionService } from './modules/transaction/index.js';
import type { WalletModuleConfig, WalletManagerConstructor, IWalletAccount, FeeRates } from './modules/wallet/index.js';
import type { ChainRpcConfig, IProvider } from './modules/provider/index.js';
import type { PrivacyProviderConstructor } from './modules/privacy/index.js';
import { PrivacyProtocol } from './modules/privacy/index.js';
import type { PrivacyModuleConfig, ShieldedBalance, ShieldParams, UnshieldParams, PrivacyTransactionResult } from './modules/privacy/index.js';
import type { TransactionRequest, UnifiedTransactionResult } from './modules/transaction/index.js';
import { Logger } from './lib/logger.js';
import type { BlockchainId } from './types/common.js';

/**
 * Merlin — Privacy-preserving multi-chain wallet SDK.
 *
 * Unified interface that combines:
 * - Multi-chain wallet management (inspired by Tether WDK)
 * - Privacy protocol integration (inspired by Ethereum Kohaku)
 * - Provider abstraction (ethers, viem, raw JSON-RPC)
 * - Unified transaction routing (public or shielded)
 *
 * Usage:
 * ```ts
 * const merlin = new Merlin({ seed: 'your twelve word mnemonic ...' });
 * merlin
 *   .registerChain({ chainId: 1, name: 'Ethereum', url: 'https://...' })
 *   .registerWallet('ethereum', EvmWalletManager, { rpcUrl: '...' });
 *
 * const account = await merlin.getAccount('ethereum', 0);
 * const address = await account.getAddress();
 * ```
 */
export class Merlin {
  public readonly wallet: WalletService;
  public readonly provider: ProviderService;
  public readonly privacy: PrivacyService;
  public readonly transaction: TransactionService;

  private readonly logger: Logger;

  constructor(config: MerlinConfig) {
    this.logger = new Logger('merlin', config.debug);

    this.wallet = new WalletService(config.seed);
    this.provider = new ProviderService();
    this.privacy = new PrivacyService();
    this.transaction = new TransactionService(this.wallet, this.privacy);

    // Register any chains provided in config
    if (config.chains) {
      for (const chain of config.chains) {
        this.provider.registerChain(chain);
      }
    }

    this.logger.info('Merlin SDK initialized', {
      chains: config.chains?.map(c => c.chainId) ?? [],
    });
  }

  // -- Wallet shortcuts --

  /**
   * Register a wallet manager for a blockchain.
   */
  registerWallet(
    blockchain: BlockchainId,
    WalletManager: WalletManagerConstructor,
    config: WalletModuleConfig,
  ): this {
    this.wallet.registerWallet(blockchain, WalletManager, config);
    this.logger.info('Wallet registered', { blockchain });
    return this;
  }

  /**
   * Derive an account at the given index.
   */
  async getAccount(blockchain: BlockchainId, index: number = 0): Promise<IWalletAccount> {
    return this.wallet.getAccount(blockchain, index);
  }

  /**
   * Get fee rates for a blockchain.
   */
  async getFeeRates(blockchain: BlockchainId): Promise<FeeRates> {
    return this.wallet.getFeeRates(blockchain);
  }

  // -- Provider shortcuts --

  /**
   * Register an RPC chain configuration.
   */
  registerChain(config: ChainRpcConfig): this {
    this.provider.registerChain(config);
    return this;
  }

  /**
   * Get a provider for a chain.
   */
  getProvider(chainId: number): IProvider {
    return this.provider.getProvider(chainId);
  }

  // -- Privacy shortcuts --

  /**
   * Register a privacy protocol for a chain.
   */
  registerPrivacyProtocol(
    protocol: PrivacyProtocol,
    chainId: number,
    Provider: PrivacyProviderConstructor,
    config: PrivacyModuleConfig,
  ): this {
    this.privacy.registerProtocol(protocol, chainId, Provider, config);
    this.logger.info('Privacy protocol registered', { protocol, chainId });
    return this;
  }

  /**
   * Shield tokens (public -> private).
   */
  async shield(protocol: PrivacyProtocol, chainId: number, params: ShieldParams): Promise<PrivacyTransactionResult> {
    return this.privacy.shield(protocol, chainId, params);
  }

  /**
   * Unshield tokens (private -> public).
   */
  async unshield(protocol: PrivacyProtocol, chainId: number, params: UnshieldParams): Promise<PrivacyTransactionResult> {
    return this.privacy.unshield(protocol, chainId, params);
  }

  /**
   * Get shielded balances.
   */
  async getShieldedBalances(protocol: PrivacyProtocol, chainId: number): Promise<ShieldedBalance[]> {
    return this.privacy.getShieldedBalances(protocol, chainId);
  }

  // -- Transaction shortcut --

  /**
   * Send a transaction (public or shielded, routed automatically).
   */
  async send(request: TransactionRequest): Promise<UnifiedTransactionResult> {
    return this.transaction.send(request);
  }

  // -- Lifecycle --

  /**
   * Dispose all services, securely erasing sensitive data.
   */
  dispose(): void {
    this.wallet.dispose();
    this.privacy.dispose();
    this.logger.info('Merlin SDK disposed');
  }
}
