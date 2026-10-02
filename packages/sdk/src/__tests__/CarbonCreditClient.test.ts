import { describe, it, expect } from 'vitest';
import { CarbonCreditClient } from '../CarbonCreditClient';

describe('CarbonCreditClient', () => {
  it('calculates carbon credit tokens (1 token = 1 ton CO2 eq) proportional to sponsorship', () => {
    // 50% contribution of 1,000 trees with 1x multiplier = 500 tokens
    const credits = CarbonCreditClient.calculateAllocation(
      BigInt(5000),
      BigInt(10000),
      1000,
      1
    );
    expect(credits).toBe(BigInt(500));
  });

  it('doubles carbon credits when rainy season 2x multiplier is active', () => {
    // 50% contribution of 1,000 trees with 2x multiplier = 1,000 tokens
    const credits = CarbonCreditClient.calculateAllocation(
      BigInt(5000),
      BigInt(10000),
      1000,
      2
    );
    expect(credits).toBe(BigInt(1000));
  });

  it('returns 0 if trees or contribution are 0', () => {
    expect(CarbonCreditClient.calculateAllocation(BigInt(0), BigInt(10000), 1000, 1)).toBe(BigInt(0));
    expect(CarbonCreditClient.calculateAllocation(BigInt(5000), BigInt(10000), 0, 1)).toBe(BigInt(0));
  });
});
