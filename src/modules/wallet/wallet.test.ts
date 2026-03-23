import { describe, it, expect } from 'vitest';
import { WalletService } from './wallet.service.js';

describe('WalletService', () => {
  describe('isValidSeed', () => {
    it('accepts a 12-word mnemonic', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      expect(WalletService.isValidSeed(mnemonic)).toBe(true);
    });

    it('accepts a 24-word mnemonic', () => {
      const mnemonic = Array(24).fill('abandon').join(' ');
      expect(WalletService.isValidSeed(mnemonic)).toBe(true);
    });

    it('rejects a mnemonic with wrong word count', () => {
      expect(WalletService.isValidSeed('abandon abandon abandon')).toBe(false);
    });

    it('accepts valid seed bytes (32 bytes)', () => {
      const seed = new Uint8Array(32).fill(1);
      expect(WalletService.isValidSeed(seed)).toBe(true);
    });

    it('rejects seed bytes that are too short', () => {
      const seed = new Uint8Array(8).fill(1);
      expect(WalletService.isValidSeed(seed)).toBe(false);
    });
  });

  describe('constructor', () => {
    it('throws MerlinError for invalid seed', () => {
      expect(() => new WalletService('bad seed')).toThrow('not a valid BIP-39');
    });

    it('creates instance with valid mnemonic', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const service = new WalletService(mnemonic);
      expect(service).toBeInstanceOf(WalletService);
    });
  });

  describe('wallet registration', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    it('reports no wallets initially', () => {
      const service = new WalletService(mnemonic);
      expect(service.getRegisteredBlockchains()).toEqual([]);
      expect(service.hasWallet('ethereum')).toBe(false);
    });

    it('throws when getting account for unregistered chain', async () => {
      const service = new WalletService(mnemonic);
      await expect(service.getAccount('ethereum')).rejects.toThrow('No wallet registered');
    });
  });
});
