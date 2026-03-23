import { describe, it, expect } from 'vitest';
import { TransactionMode } from './transaction.types.js';

describe('TransactionTypes', () => {
  it('defines PUBLIC and SHIELDED modes', () => {
    expect(TransactionMode.PUBLIC).toBe('public');
    expect(TransactionMode.SHIELDED).toBe('shielded');
  });
});
