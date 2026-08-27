import { describe, it, expect } from 'vitest';
import { StellarService } from './stellar';

describe('StellarService (lib/stellar)', () => {
  describe('validateStellarAddress', () => {
    it('returns true for a valid Stellar public key', () => {
      const valid = StellarService.validateStellarAddress(
        'GD6BXVRVMEPHHXNZYVCI6HIJIB4OOGEFMVZ6OD2EWE37WCTMOVOCNJUW'
      );
      expect(valid).toBe(true);
    });

    it('returns true for another valid Stellar address', () => {
      const valid = StellarService.validateStellarAddress(
        'GDQJUTQYK2MQX2VGDR2FYWLIYAQIEGXTQVTFEMGH2BEWFG4BRUY4CKI7'
      );
      expect(valid).toBe(true);
    });

    it('returns false for an address with invalid length', () => {
      const valid = StellarService.validateStellarAddress('GABCDEF123');
      expect(valid).toBe(false);
    });

    it('returns false for an empty string', () => {
      const valid = StellarService.validateStellarAddress('');
      expect(valid).toBe(false);
    });

    it('returns false for a random non-address string', () => {
      const valid = StellarService.validateStellarAddress('not-a-stellar-address');
      expect(valid).toBe(false);
    });
  });

  describe('formatAmount', () => {
    it('formats a number string with default 7 decimals', () => {
      const result = StellarService.formatAmount('1000');
      expect(result).toBe('1000.0000000');
    });

    it('formats with custom decimals', () => {
      const result = StellarService.formatAmount('1000', 2);
      expect(result).toBe('1000.00');
    });

    it('handles fractional amounts', () => {
      const result = StellarService.formatAmount('123.456', 3);
      expect(result).toBe('123.456');
    });

    it('handles zero', () => {
      const result = StellarService.formatAmount('0', 2);
      expect(result).toBe('0.00');
    });
  });

  describe('formatTokenAmount', () => {
    it('removes trailing zeros after decimal', () => {
      const result = StellarService.formatTokenAmount('150.5000000');
      expect(result).toBe('150.5');
    });

    it('removes decimal entirely when all zeros', () => {
      const result = StellarService.formatTokenAmount('1000.0000000');
      expect(result).toBe('1000');
    });

    it('preserves significant decimal digits', () => {
      const result = StellarService.formatTokenAmount('0.1234567');
      expect(result).toBe('0.1234567');
    });

    it('handles zero', () => {
      const result = StellarService.formatTokenAmount('0');
      expect(result).toBe('0');
    });

    it('preserves trailing zeros when decimals = 0', () => {
      const result = StellarService.formatTokenAmount('1000', 0);
      expect(result).toBe('1000');
    });

    it('does not strip integer trailing zeros when decimals = 0', () => {
      const result = StellarService.formatTokenAmount('10', 0);
      expect(result).toBe('10');
    });

    it('returns 0 when decimals = 0 and amount is 0', () => {
      const result = StellarService.formatTokenAmount('0', 0);
      expect(result).toBe('0');
    });
  });

  describe('calculateStreamProgress', () => {
    const createMockStream = (overrides: Partial<{
      startTime: number;
      endTime: number;
      totalAmount: string;
    }> = {}) => ({
      id: 'stream_1',
      contractStreamId: 1,
      sender: 'GD6BXVRVMEPHHXNZYVCI6HIJIB4OOGEFMVZ6OD2EWE37WCTMOVOCNJUW',
      recipient: 'GDQJUTQYK2MQX2VGDR2FYWLIYAQIEGXTQVTFEMGH2BEWFG4BRUY4CKI7',
      token: 'USDC',
      tokenSymbol: 'USDC',
      totalAmount: '1000.0000000',
      withdrawnAmount: '250.0000000',
      startTime: Date.now() - 86400000, // 1 day ago
      endTime: Date.now() + 86400000 * 6, // 6 days from now
      status: 'Active' as const,
      cancelable: true,
      transferable: false,
      ...overrides,
    });

    it('returns progress between 0 and 100 percent', () => {
      const stream = createMockStream();
      const progress = StellarService.calculateStreamProgress(stream);
      expect(progress.progressPercentage).toBeGreaterThanOrEqual(0);
      expect(progress.progressPercentage).toBeLessThanOrEqual(100);
    });

    it('returns a timeRemaining string', () => {
      const stream = createMockStream();
      const progress = StellarService.calculateStreamProgress(stream);
      expect(progress.timeRemaining).toBeTruthy();
      expect(typeof progress.timeRemaining).toBe('string');
    });

    it('returns a positive ratePerHour', () => {
      const stream = createMockStream();
      const progress = StellarService.calculateStreamProgress(stream);
      expect(progress.ratePerHour).toBeGreaterThan(0);
    });

    it('caps progress at 100% for completed streams', () => {
      const stream = createMockStream({
        startTime: Date.now() - 86400000 * 30, // 30 days ago
        endTime: Date.now() - 86400000, // 1 day ago (already ended)
      });
      const progress = StellarService.calculateStreamProgress(stream);
      expect(progress.progressPercentage).toBe(100);
    });

    it('shows 0% for streams that have not started', () => {
      const stream = createMockStream({
        startTime: Date.now() + 86400000, // 1 day in the future
        endTime: Date.now() + 86400000 * 7, // 7 days in the future
      });
      const progress = StellarService.calculateStreamProgress(stream);
      expect(progress.progressPercentage).toBe(0);
    });
  });
});
