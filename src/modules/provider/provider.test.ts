import { describe, it, expect } from 'vitest';
import { ProviderService } from './provider.service.js';

describe('ProviderService', () => {
  it('starts with no chains registered', () => {
    const service = new ProviderService();
    expect(service.getRegisteredChains()).toEqual([]);
    expect(service.hasChain(1)).toBe(false);
  });

  it('registers a chain config', () => {
    const service = new ProviderService();
    service.registerChain({
      chainId: 1,
      name: 'Ethereum Mainnet',
      url: 'https://eth.example.com',
    });
    expect(service.hasChain(1)).toBe(true);
    expect(service.getRegisteredChains()).toEqual([1]);
  });

  it('returns chain config', () => {
    const service = new ProviderService();
    const config = {
      chainId: 11155111,
      name: 'Sepolia',
      url: 'https://sepolia.example.com',
      testnet: true,
    };
    service.registerChain(config);
    expect(service.getChainConfig(11155111)).toEqual(config);
  });

  it('throws when getting provider for unregistered chain', () => {
    const service = new ProviderService();
    expect(() => service.getProvider(1)).toThrow('No RPC configuration');
  });

  it('creates a provider for a registered chain', () => {
    const service = new ProviderService();
    service.registerChain({
      chainId: 1,
      name: 'Ethereum Mainnet',
      url: 'https://eth.example.com',
    });
    const provider = service.getProvider(1);
    expect(provider).toBeDefined();
    expect(provider.getBlockNumber).toBeDefined();
  });
});
