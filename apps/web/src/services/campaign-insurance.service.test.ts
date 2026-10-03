import { describe, it, expect } from 'vitest';
import { CampaignInsuranceService } from './campaign-insurance.service';

describe('CampaignInsuranceService', () => {
  it('computes coverage status and 1% funding accurately', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-06-01T00:00:00Z');
    const status = CampaignInsuranceService.getCoverageStatus(851, BigInt(100000), createdAt, now);

    expect(status.insuranceFundedAmount).toBe(BigInt(1000));
    expect(status.isCovered).toBe(true);
    expect(status.daysRemaining).toBeGreaterThan(500);
  });

  it('marks coverage as expired after 2 years', () => {
    const createdAt = new Date('2024-01-01T00:00:00Z');
    const now = new Date('2026-02-01T00:00:00Z');
    const status = CampaignInsuranceService.getCoverageStatus(851, BigInt(100000), createdAt, now);

    expect(status.isCovered).toBe(false);
    expect(status.daysRemaining).toBe(0);
  });
});
