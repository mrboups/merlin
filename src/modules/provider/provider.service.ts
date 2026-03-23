import { MerlinError, MerlinErrorCode } from '../../types/common.js';
import type { Hex } from '../../types/common.js';
import type {
  ChainRpcConfig,
  IProvider,
  TransactionReceipt,
} from './provider.types.js';

/**
 * ProviderService manages RPC connections to blockchain networks.
 * It supports multiple chains, fallback RPCs, and abstracts over
 * the underlying provider library (ethers, viem, or raw JSON-RPC).
 *
 * Modeled after Kohaku's provider package which wraps ethers, viem, and colibri.
 */
export class ProviderService {
  private readonly chains: Map<number, ChainRpcConfig> = new Map();
  private readonly providers: Map<number, IProvider> = new Map();

  /**
   * Register an RPC configuration for a chain.
   */
  registerChain(config: ChainRpcConfig): this {
    this.chains.set(config.chainId, config);
    return this;
  }

  /**
   * Get or create a provider for a given chain ID.
   * Uses a raw JSON-RPC provider by default.
   */
  getProvider(chainId: number): IProvider {
    const existing = this.providers.get(chainId);
    if (existing) return existing;

    const config = this.chains.get(chainId);
    if (!config) {
      throw new MerlinError(
        MerlinErrorCode.PROVIDER_NOT_CONFIGURED,
        `No RPC configuration registered for chain ${chainId}`,
        { chainId, registeredChains: Array.from(this.chains.keys()) },
      );
    }

    const provider = new JsonRpcProvider(config.url, config.fallbacks);
    this.providers.set(chainId, provider);
    return provider;
  }

  /**
   * Check if a chain has been configured.
   */
  hasChain(chainId: number): boolean {
    return this.chains.has(chainId);
  }

  /**
   * Get all registered chain IDs.
   */
  getRegisteredChains(): number[] {
    return Array.from(this.chains.keys());
  }

  /**
   * Get the chain config for a given chain ID.
   */
  getChainConfig(chainId: number): ChainRpcConfig | undefined {
    return this.chains.get(chainId);
  }
}

/**
 * Minimal JSON-RPC provider implementation.
 * Makes direct fetch calls to the RPC endpoint with automatic fallback.
 */
class JsonRpcProvider implements IProvider {
  private readonly url: string;
  private readonly fallbacks: string[];
  private requestId = 0;

  constructor(url: string, fallbacks: string[] = []) {
    this.url = url;
    this.fallbacks = fallbacks;
  }

  async getBlockNumber(): Promise<number> {
    const result = await this.rpcCall<string>('eth_blockNumber', []);
    return parseInt(result, 16);
  }

  async getBalance(address: Hex): Promise<bigint> {
    const result = await this.rpcCall<string>('eth_getBalance', [address, 'latest']);
    return BigInt(result);
  }

  async call(tx: { to: Hex; data: Hex }): Promise<Hex> {
    return this.rpcCall<Hex>('eth_call', [tx, 'latest']);
  }

  async sendRawTransaction(signedTx: Hex): Promise<Hex> {
    return this.rpcCall<Hex>('eth_sendRawTransaction', [signedTx]);
  }

  async getTransactionReceipt(hash: Hex): Promise<TransactionReceipt | null> {
    const result = await this.rpcCall<RawReceipt | null>('eth_getTransactionReceipt', [hash]);
    if (!result) return null;
    return {
      hash: result.transactionHash,
      blockNumber: parseInt(result.blockNumber, 16),
      status: result.status === '0x1' ? 'success' : 'reverted',
      gasUsed: BigInt(result.gasUsed),
    };
  }

  async getGasPrice(): Promise<bigint> {
    const result = await this.rpcCall<string>('eth_gasPrice', []);
    return BigInt(result);
  }

  async estimateGas(tx: { to: Hex; data?: Hex; value?: bigint }): Promise<bigint> {
    const params: Record<string, string> = { to: tx.to };
    if (tx.data) params.data = tx.data;
    if (tx.value !== undefined) params.value = `0x${tx.value.toString(16)}`;
    const result = await this.rpcCall<string>('eth_estimateGas', [params]);
    return BigInt(result);
  }

  private async rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    const urls = [this.url, ...this.fallbacks];
    let lastError: Error | undefined;

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: ++this.requestId,
            method,
            params,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json = await response.json() as { result?: T; error?: { message: string; code: number } };

        if (json.error) {
          throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
        }

        return json.result as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw new MerlinError(
      MerlinErrorCode.PROVIDER_NOT_CONFIGURED,
      `All RPC endpoints failed for method ${method}: ${lastError?.message}`,
      { method, params, endpoints: urls },
    );
  }
}

/**
 * Raw JSON-RPC receipt shape
 */
interface RawReceipt {
  transactionHash: Hex;
  blockNumber: string;
  status: string;
  gasUsed: string;
}
