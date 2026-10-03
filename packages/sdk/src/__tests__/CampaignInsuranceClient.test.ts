import { describe, it, expect } from 'vitest';
import { CampaignInsuranceClient } from '../CampaignInsuranceClient';

describe('CampaignInsuranceClient', () => {
  it('calculates 1% insurance fee correctly', () => {
    expect(CampaignInsuranceClient.calculateInsuranceFee(BigInt(10000))).toBe(BigInt(100));
    expect(CampaignInsuranceClient.calculateInsuranceFee(BigInt(500000))).toBe(BigInt(5000));
    expect(CampaignInsuranceClient.calculateInsuranceFee(BigInt(0))).toBe(BigInt(0));
  });

  it('validates 2-year tree mortality insurance window', () => {
    const createdAt = 1700000000;
    // 1 year later -> valid
    expect(CampaignInsuranceClient.isClaimValid(createdAt, createdAt + 31_536_000)).toBe(true);
    // 2 years exactly -> valid
    expect(CampaignInsuranceClient.isClaimValid(createdAt, createdAt + 63_072_000)).toBe(true);
    // 2 years + 1 day -> invalid
    expect(CampaignInsuranceClient.isClaimValid(createdAt, createdAt + 63_072_000 + 86400)).toBe(false);
  });
});
