import { MerlinError, MerlinErrorCode } from '../../types/common.js';
import type {
  PrivacyModuleConfig,
  IPrivacyProvider,
  ShieldedBalance,
  ShieldParams,
  UnshieldParams,
  PrivateTransferParams,
  PrivacyTransactionResult,
} from './privacy.types.js';
import { PrivacyProtocol } from './privacy.types.js';

/**
 * Constructor type for privacy provider implementations.
 * Each privacy protocol (Railgun, Privacy Pools, etc.) must implement IPrivacyProvider.
 */
export type PrivacyProviderConstructor = new (config: PrivacyModuleConfig) => IPrivacyProvider;

/**
 * PrivacyService manages privacy protocol integrations.
 * It acts as a registry and facade for different privacy protocols,
 * allowing the SDK to shield, unshield, and privately transfer tokens
 * using whichever protocol is configured.
 *
 * Designed to integrate with Kohaku's Railgun and Privacy Pools implementations.
 */
export class PrivacyService {
  private readonly providers: Map<string, IPrivacyProvider> = new Map();
  private readonly constructors: Map<string, { Ctor: PrivacyProviderConstructor; config: PrivacyModuleConfig }> = new Map();

  /**
   * Register a privacy protocol implementation.
   * The provider is lazily instantiated on first use.
   */
  registerProtocol(
    protocol: PrivacyProtocol,
    chainId: number,
    Provider: PrivacyProviderConstructor,
    config: PrivacyModuleConfig,
  ): this {
    const key = this.makeKey(protocol, chainId);
    this.constructors.set(key, { Ctor: Provider, config });
    return this;
  }

  /**
   * Get a privacy provider for a specific protocol and chain.
   * Initializes the provider on first access.
   */
  async getProvider(protocol: PrivacyProtocol, chainId: number): Promise<IPrivacyProvider> {
    const key = this.makeKey(protocol, chainId);

    const existing = this.providers.get(key);
    if (existing) return existing;

    const entry = this.constructors.get(key);
    if (!entry) {
      throw new MerlinError(
        MerlinErrorCode.PRIVACY_PROTOCOL_ERROR,
        `No privacy provider registered for ${protocol} on chain ${chainId}`,
        { protocol, chainId },
      );
    }

    const provider = new entry.Ctor(entry.config);
    await provider.initialize();
    this.providers.set(key, provider);
    return provider;
  }

  /**
   * Shield tokens using a specific protocol on a specific chain.
   */
  async shield(
    protocol: PrivacyProtocol,
    chainId: number,
    params: ShieldParams,
  ): Promise<PrivacyTransactionResult> {
    const provider = await this.getProvider(protocol, chainId);
    return provider.shield(params);
  }

  /**
   * Unshield tokens using a specific protocol on a specific chain.
   */
  async unshield(
    protocol: PrivacyProtocol,
    chainId: number,
    params: UnshieldParams,
  ): Promise<PrivacyTransactionResult> {
    const provider = await this.getProvider(protocol, chainId);
    return provider.unshield(params);
  }

  /**
   * Privately transfer tokens using a specific protocol on a specific chain.
   */
  async privateTransfer(
    protocol: PrivacyProtocol,
    chainId: number,
    params: PrivateTransferParams,
  ): Promise<PrivacyTransactionResult> {
    const provider = await this.getProvider(protocol, chainId);
    return provider.privateTransfer(params);
  }

  /**
   * Get shielded balances for a specific protocol on a specific chain.
   */
  async getShieldedBalances(
    protocol: PrivacyProtocol,
    chainId: number,
  ): Promise<ShieldedBalance[]> {
    const provider = await this.getProvider(protocol, chainId);
    return provider.getShieldedBalances();
  }

  /**
   * Check if a protocol is registered for a given chain.
   */
  hasProtocol(protocol: PrivacyProtocol, chainId: number): boolean {
    return this.constructors.has(this.makeKey(protocol, chainId));
  }

  /**
   * Dispose all initialized providers.
   */
  dispose(): void {
    for (const [, provider] of this.providers) {
      provider.dispose();
    }
    this.providers.clear();
    this.constructors.clear();
  }

  private makeKey(protocol: PrivacyProtocol, chainId: number): string {
    return `${protocol}:${chainId}`;
  }
}
