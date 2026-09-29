import { describe, it, expect } from 'vitest';
import { CampaignEscrowService, EscrowStatus, CampaignEscrowDetails } from './campaign-escrow.service';

describe('CampaignEscrowService', () => {
  const baseEscrow: CampaignEscrowDetails = {
    campaignId: 864,
    creator: 'GCREATOR',
    verifier: 'GVERIFIER',
    totalEscrowed: BigInt(50000),
    releasedAmount: BigInt(0),
    treesPlanted: 1000,
    targetTrees: 1000,
    status: EscrowStatus.Held,
    isVerified: false,
    createdAt: 1700000000,
    verifiedAt: 0,
  };

  it('rejects release eligibility when escrow is unverified', () => {
    expect(CampaignEscrowService.isEligibleForRelease(baseEscrow)).toBe(false);
  });

  it('approves release eligibility when escrow is verified', () => {
    const verifiedEscrow: CampaignEscrowDetails = {
      ...baseEscrow,
      status: EscrowStatus.Verified,
      isVerified: true,
      verifiedAt: 1700005000,
    };
    expect(CampaignEscrowService.isEligibleForRelease(verifiedEscrow)).toBe(true);
  });

  it('calculates progress accurately in basis points', () => {
    expect(CampaignEscrowService.calculateVerificationProgressBps(500, 1000)).toBe(5000);
    expect(CampaignEscrowService.calculateVerificationProgressBps(1000, 1000)).toBe(10000);
    expect(CampaignEscrowService.calculateVerificationProgressBps(0, 1000)).toBe(0);
  });

  it('provides correct summary metadata for Held status', () => {
    const summary = CampaignEscrowService.getEscrowSummary(baseEscrow);
    expect(summary.label).toBe('Funds in Escrow');
    expect(summary.canRelease).toBe(false);
  });
});
