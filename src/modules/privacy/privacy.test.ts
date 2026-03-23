import { describe, it, expect } from 'vitest';
import { PrivacyService } from './privacy.service.js';
import { PrivacyProtocol } from './privacy.types.js';

describe('PrivacyService', () => {
  it('starts with no protocols registered', () => {
    const service = new PrivacyService();
    expect(service.hasProtocol(PrivacyProtocol.RAILGUN, 1)).toBe(false);
  });

  it('throws when getting unregistered provider', async () => {
    const service = new PrivacyService();
    await expect(
      service.getProvider(PrivacyProtocol.RAILGUN, 1),
    ).rejects.toThrow('No privacy provider registered');
  });

  it('disposes cleanly when empty', () => {
    const service = new PrivacyService();
    expect(() => service.dispose()).not.toThrow();
  });
});
