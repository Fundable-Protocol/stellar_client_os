import type {
  CreateEarlyBirdTierInput,
  EarlyBirdCountdownInfo,
  EarlyBirdStatus,
  EarlyBirdTier,
  UpdateEarlyBirdTierInput,
} from '@/types/early-bird-tier';

/**
 * In-memory service for early-bird discount reward tiers (Issue #1342).
 *
 * Responsibilities:
 *  - CRUD for early-bird tiers per campaign.
 *  - Computing live countdown info (time remaining / slots remaining).
 *  - Claiming a spot and enforcing inventory / time limits.
 *  - Automatic fallback status resolution.
 */
export class EarlyBirdTierService {
  private store: Map<string, EarlyBirdTier[]> = new Map();

  // ---------------------------------------------------------------------------
  // Status helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves the runtime status of a tier without mutating it.
   * @param tier - the tier to evaluate.
   * @param now  - Unix epoch in milliseconds (injectable for testing).
   */
  public resolveStatus(tier: EarlyBirdTier, now: number = Date.now()): EarlyBirdStatus {
    if (tier.inventoryCap !== null && tier.claimedCount >= tier.inventoryCap) {
      return 'sold_out';
    }
    if (tier.expiresAt !== null) {
      const expiryMs = new Date(tier.expiresAt).getTime();
      if (!Number.isNaN(expiryMs) && now >= expiryMs) {
        return 'expired';
      }
    }
    return 'active';
  }

  /**
   * Returns countdown info suitable for driving a UI timer.
   */
  public getCountdownInfo(tier: EarlyBirdTier, now: number = Date.now()): EarlyBirdCountdownInfo {
    const status = this.resolveStatus(tier, now);

    let msRemaining: number | null = null;
    if (tier.expiresAt !== null) {
      const expiryMs = new Date(tier.expiresAt).getTime();
      if (!Number.isNaN(expiryMs)) {
        msRemaining = Math.max(0, expiryMs - now);
      }
    }

    const slotsRemaining =
      tier.inventoryCap !== null
        ? Math.max(0, tier.inventoryCap - tier.claimedCount)
        : null;

    return { tierId: tier.id, status, msRemaining, slotsRemaining };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private tiersFor(campaignId: string): EarlyBirdTier[] {
    return this.store.get(campaignId) ?? [];
  }

  private hydrateStatus(tier: EarlyBirdTier, now: number): EarlyBirdTier {
    return { ...tier, status: this.resolveStatus(tier, now) };
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /** Returns all tiers for a campaign, with live status hydrated. */
  public async getTiers(campaignId: string, now: number = Date.now()): Promise<EarlyBirdTier[]> {
    return this.tiersFor(campaignId).map((t) => this.hydrateStatus(t, now));
  }

  /** Returns a single tier by id, or null if not found. */
  public async getTier(
    campaignId: string,
    tierId: string,
    now: number = Date.now(),
  ): Promise<EarlyBirdTier | null> {
    const tier = this.tiersFor(campaignId).find((t) => t.id === tierId) ?? null;
    return tier ? this.hydrateStatus(tier, now) : null;
  }

  /** Creates a new early-bird tier for a campaign. */
  public async createTier(
    campaignId: string,
    creatorAddress: string,
    input: CreateEarlyBirdTierInput,
    now: number = Date.now(),
  ): Promise<EarlyBirdTier> {
    if (!creatorAddress?.trim()) throw new Error('Creator address is required');
    if (!input.title?.trim()) throw new Error('Tier title is required');
    if (!input.description?.trim()) throw new Error('Tier description is required');
    if (!input.pledgeAmount?.trim()) throw new Error('Pledge amount is required');

    if (input.inventoryCap !== undefined && input.inventoryCap !== null) {
      if (!Number.isInteger(input.inventoryCap) || input.inventoryCap <= 0) {
        throw new Error('inventoryCap must be a positive integer');
      }
    }

    if (input.expiresAt !== undefined && input.expiresAt !== null) {
      const ts = new Date(input.expiresAt).getTime();
      if (Number.isNaN(ts)) throw new Error('expiresAt must be a valid ISO-8601 date string');
      if (ts <= now) throw new Error('expiresAt must be in the future');
    }

    const tier: EarlyBirdTier = {
      id: `eb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      campaignId,
      title: input.title.trim(),
      description: input.description.trim(),
      pledgeAmount: input.pledgeAmount.trim(),
      expiresAt: input.expiresAt ?? null,
      inventoryCap: input.inventoryCap ?? null,
      claimedCount: 0,
      fallbackTierId: input.fallbackTierId ?? null,
      status: 'active',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };

    const tiers = this.tiersFor(campaignId);
    tiers.push(tier);
    this.store.set(campaignId, tiers);

    return this.hydrateStatus(tier, now);
  }

  /** Updates mutable fields of an existing early-bird tier. */
  public async updateTier(
    campaignId: string,
    tierId: string,
    creatorAddress: string,
    input: UpdateEarlyBirdTierInput,
    now: number = Date.now(),
  ): Promise<EarlyBirdTier> {
    if (!creatorAddress?.trim()) throw new Error('Creator address is required');

    const tiers = this.tiersFor(campaignId);
    const index = tiers.findIndex((t) => t.id === tierId);
    if (index === -1) throw new Error(`Early-bird tier ${tierId} not found`);

    if (input.inventoryCap !== undefined && input.inventoryCap !== null) {
      if (!Number.isInteger(input.inventoryCap) || input.inventoryCap <= 0) {
        throw new Error('inventoryCap must be a positive integer');
      }
    }

    if (input.expiresAt !== undefined && input.expiresAt !== null) {
      const ts = new Date(input.expiresAt).getTime();
      if (Number.isNaN(ts)) throw new Error('expiresAt must be a valid ISO-8601 date string');
    }

    const current = tiers[index];
    const updated: EarlyBirdTier = {
      ...current,
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.pledgeAmount !== undefined ? { pledgeAmount: input.pledgeAmount.trim() } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.inventoryCap !== undefined ? { inventoryCap: input.inventoryCap } : {}),
      ...(input.fallbackTierId !== undefined ? { fallbackTierId: input.fallbackTierId } : {}),
      updatedAt: new Date(now).toISOString(),
      status: 'active', // will be re-resolved below
    };

    tiers[index] = updated;
    this.store.set(campaignId, tiers);

    return this.hydrateStatus(updated, now);
  }

  /** Deletes a tier. Returns true if deleted, false if not found. */
  public async deleteTier(
    campaignId: string,
    tierId: string,
    creatorAddress: string,
  ): Promise<boolean> {
    if (!creatorAddress?.trim()) throw new Error('Creator address is required');
    const tiers = this.tiersFor(campaignId);
    const index = tiers.findIndex((t) => t.id === tierId);
    if (index === -1) return false;
    tiers.splice(index, 1);
    this.store.set(campaignId, tiers);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Claiming
  // ---------------------------------------------------------------------------

  /**
   * Claims a spot in the early-bird tier for a backer.
   *
   * @throws if the tier is expired, sold out, or at capacity.
   * @returns the updated tier (with incremented claimedCount).
   */
  public async claimSpot(
    campaignId: string,
    tierId: string,
    backerAddress: string,
    now: number = Date.now(),
  ): Promise<EarlyBirdTier> {
    if (!backerAddress?.trim()) throw new Error('Backer address is required');

    const tiers = this.tiersFor(campaignId);
    const index = tiers.findIndex((t) => t.id === tierId);
    if (index === -1) throw new Error(`Early-bird tier ${tierId} not found`);

    const tier = tiers[index];
    const status = this.resolveStatus(tier, now);

    if (status === 'expired') throw new Error('Early-bird tier has expired');
    if (status === 'sold_out') throw new Error('Early-bird tier is sold out');

    const updated: EarlyBirdTier = {
      ...tier,
      claimedCount: tier.claimedCount + 1,
      updatedAt: new Date(now).toISOString(),
      status: 'active',
    };

    tiers[index] = updated;
    this.store.set(campaignId, tiers);

    return this.hydrateStatus(updated, now);
  }
}
