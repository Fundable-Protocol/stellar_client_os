import { describe, it, expect, beforeEach } from 'vitest';
import { CampaignEscrowClient, EscrowStatus } from '../CampaignEscrowClient';

describe('CampaignEscrowClient', () => {
  let client: CampaignEscrowClient;
  const mockContractAddress = 'CA7QYNF7SOWQ3G';

  beforeEach(() => {
    client = new CampaignEscrowClient(mockContractAddress);
  });

  it('validates verifier address on initializeEscrow', async () => {
    await expect(client.initializeEscrow(1, '', 100)).rejects.toThrow('Verifier address is required');
  });

  it('validates target trees on initializeEscrow', async () => {
    await expect(client.initializeEscrow(1, 'GVERIFIER', 0)).rejects.toThrow('Target trees must be greater than zero');
  });

  it('validates positive deposit amount on depositToEscrow', async () => {
    await expect(client.depositToEscrow(1, 'GSPONSOR', BigInt(0))).rejects.toThrow('Deposit amount must be positive');
  });

  it('validates trees planted on approveTreeVerification', async () => {
    await expect(client.approveTreeVerification(1, 0)).rejects.toThrow('Trees planted must be greater than zero');
  });

  it('validates disputer on disputeEscrow', async () => {
    await expect(client.disputeEscrow(1, '')).rejects.toThrow('Disputer address is required');
  });

  it('initializes default escrow state', async () => {
    const escrow = await client.getEscrow(42);
    expect(escrow.campaignId).toBe(42);
    expect(escrow.status).toBe(EscrowStatus.Held);
    expect(escrow.isVerified).toBe(false);
  });
});
