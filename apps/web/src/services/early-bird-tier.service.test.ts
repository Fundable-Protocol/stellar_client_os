import { beforeEach, describe, expect, it } from 'vitest';
import { EarlyBirdTierService } from './early-bird-tier.service';

const CAMPAIGN_ID = 'camp-eb-test';
const CREATOR = 'GCREATOR000000000000000000000000000000000000000000000000';
const BACKER_1 = 'GBACKER1000000000000000000000000000000000000000000000000';
const BACKER_2 = 'GBACKER2000000000000000000000000000000000000000000000000';

// Helpers
const inFuture = (offsetMs: number, base: number) => new Date(base + offsetMs).toISOString();
const inPast   = (offsetMs: number, base: number) => new Date(base - offsetMs).toISOString();

describe('EarlyBirdTierService (#1342)', () => {
  let service: EarlyBirdTierService;
  const NOW = Date.now();

  beforeEach(() => {
    service = new EarlyBirdTierService();
  });

  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  it('creates an early-bird tier with time limit', async () => {
    const tier = await service.createTier(
      CAMPAIGN_ID,
      CREATOR,
      {
        title: 'Early Bird - Launch Week',
        description: 'First 50 backers get 20% off.',
        pledgeAmount: '20 XLM',
        expiresAt: inFuture(72 * 60 * 60 * 1000, NOW), // 72 h from now
        inventoryCap: 50,
      },
      NOW,
    );

    expect(tier.id).toBeDefined();
    expect(tier.status).toBe('active');
    expect(tier.claimedCount).toBe(0);
    expect(tier.inventoryCap).toBe(50);
  });

  it('creates an early-bird tier with only an inventory cap', async () => {
    const tier = await service.createTier(
      CAMPAIGN_ID,
      CREATOR,
      { title: 'Inventory Only', description: 'desc', pledgeAmount: '10 XLM', inventoryCap: 5 },
      NOW,
    );
    expect(tier.expiresAt).toBeNull();
    expect(tier.inventoryCap).toBe(5);
    expect(tier.status).toBe('active');
  });

  it('rejects creation with a past expiresAt', async () => {
    await expect(
      service.createTier(
        CAMPAIGN_ID,
        CREATOR,
        {
          title: 'Stale Tier',
          description: 'desc',
          pledgeAmount: '5 XLM',
          expiresAt: inPast(1000, NOW),
        },
        NOW,
      ),
    ).rejects.toThrow('expiresAt must be in the future');
  });

  it('rejects creation with zero inventoryCap', async () => {
    await expect(
      service.createTier(
        CAMPAIGN_ID,
        CREATOR,
        { title: 'Bad Cap', description: 'desc', pledgeAmount: '5 XLM', inventoryCap: 0 },
        NOW,
      ),
    ).rejects.toThrow('inventoryCap must be a positive integer');
  });

  // ---------------------------------------------------------------------------
  // Status resolution
  // ---------------------------------------------------------------------------

  it('resolves status as expired when current time is past expiresAt', async () => {
    const tier = await service.createTier(
      CAMPAIGN_ID,
      CREATOR,
      {
        title: 'Short Window',
        description: 'desc',
        pledgeAmount: '15 XLM',
        expiresAt: inFuture(1000, NOW),
      },
      NOW,
    );
    expect(service.resolveStatus(tier, NOW)).toBe('active');
    expect(service.resolveStatus(tier, NOW + 2000)).toBe('expired');
  });

  it('resolves status as sold_out when claimedCount reaches inventoryCap', async () => {
    const tier = await service.createTier(
      CAMPAIGN_ID,
      CREATOR,
      { title: 'Cap Only', description: 'desc', pledgeAmount: '10 XLM', inventoryCap: 1 },
      NOW,
    );
    // Simulate full claim
    const claimed = { ...tier, claimedCount: 1 };
    expect(service.resolveStatus(claimed, NOW)).toBe('sold_out');
  });

  // ---------------------------------------------------------------------------
  // Countdown info
  // ---------------------------------------------------------------------------

  it('getCountdownInfo returns correct msRemaining and slotsRemaining', async () => {
    const expiresAt = inFuture(3600 * 1000, NOW);
    const tier = await service.createTier(
      CAMPAIGN_ID,
      CREATOR,
      { title: 'Countdown Tier', description: 'desc', pledgeAmount: '10 XLM', expiresAt, inventoryCap: 10 },
      NOW,
    );
    const info = service.getCountdownInfo(tier, NOW);
    expect(info.msRemaining).toBeGreaterThan(0);
    expect(info.msRemaining).toBeLessThanOrEqual(3600 * 1000);
    expect(info.slotsRemaining).toBe(10);
    expect(info.status).toBe('active');
  });

  it('getCountdownInfo returns msRemaining: 0 after expiry', async () => {
    const tier = await service.createTier(
      CAMPAIGN_ID,
      CREATOR,
      { title: 'Expiring', description: 'desc', pledgeAmount: '10 XLM', expiresAt: inFuture(100, NOW) },
      NOW,
    );
    const info = service.getCountdownInfo(tier, NOW + 200);
    expect(info.msRemaining).toBe(0);
    expect(info.status).toBe('expired');
  });

  // ---------------------------------------------------------------------------
  // Claiming
  // ---------------------------------------------------------------------------

  it('allows a backer to claim a spot and decrements slots', async () => {
    const tier = await service.createTier(
      CAMPAIGN_ID,
      CREATOR,
      { title: 'Claimable', description: 'desc', pledgeAmount: '10 XLM', inventoryCap: 2 },
      NOW,
    );
    const afterClaim = await service.claimSpot(CAMPAIGN_ID, tier.id, BACKER_1, NOW);
    expect(afterClaim.claimedCount).toBe(1);
    expect(service.getCountdownInfo(afterClaim, NOW).slotsRemaining).toBe(1);
  });

  it('blocks claiming when sold out', async () => {
    const tier = await service.createTier(
      CAMPAIGN_ID,
      CREATOR,
      { title: 'One Slot', description: 'desc', pledgeAmount: '10 XLM', inventoryCap: 1 },
      NOW,
    );
    await service.claimSpot(CAMPAIGN_ID, tier.id, BACKER_1, NOW);
    await expect(
      service.claimSpot(CAMPAIGN_ID, tier.id, BACKER_2, NOW),
    ).rejects.toThrow('sold out');
  });

  it('blocks claiming when expired', async () => {
    const tier = await service.createTier(
      CAMPAIGN_ID,
      CREATOR,
      { title: 'Expired', description: 'desc', pledgeAmount: '10 XLM', expiresAt: inFuture(50, NOW) },
      NOW,
    );
    await expect(
      service.claimSpot(CAMPAIGN_ID, tier.id, BACKER_1, NOW + 100),
    ).rejects.toThrow('expired');
  });

  // ---------------------------------------------------------------------------
  // Update & delete
  // ---------------------------------------------------------------------------

  it('updates title and inventoryCap', async () => {
    const tier = await service.createTier(
      CAMPAIGN_ID,
      CREATOR,
      { title: 'Original', description: 'desc', pledgeAmount: '10 XLM', inventoryCap: 10 },
      NOW,
    );
    const updated = await service.updateTier(CAMPAIGN_ID, tier.id, CREATOR, { title: 'Updated', inventoryCap: 20 }, NOW);
    expect(updated.title).toBe('Updated');
    expect(updated.inventoryCap).toBe(20);
  });

  it('deletes a tier and returns true', async () => {
    const tier = await service.createTier(
      CAMPAIGN_ID,
      CREATOR,
      { title: 'To Delete', description: 'desc', pledgeAmount: '5 XLM' },
      NOW,
    );
    const result = await service.deleteTier(CAMPAIGN_ID, tier.id, CREATOR);
    expect(result).toBe(true);
    const tiers = await service.getTiers(CAMPAIGN_ID, NOW);
    expect(tiers).toHaveLength(0);
  });

  it('returns false when deleting a non-existent tier', async () => {
    const result = await service.deleteTier(CAMPAIGN_ID, 'no-such-id', CREATOR);
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Fallback tier reference
  // ---------------------------------------------------------------------------

  it('stores fallbackTierId on the tier', async () => {
    const tier = await service.createTier(
      CAMPAIGN_ID,
      CREATOR,
      { title: 'EB with fallback', description: 'desc', pledgeAmount: '10 XLM', fallbackTierId: 'std-tier-99' },
      NOW,
    );
    expect(tier.fallbackTierId).toBe('std-tier-99');
  });
});
