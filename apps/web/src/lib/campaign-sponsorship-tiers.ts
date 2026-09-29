export const CAMPAIGN_SPONSORSHIP_TIERS = [
  { id: "starter", treeCount: 10, discountBps: 500 },
  { id: "growth", treeCount: 50, discountBps: 1500 },
  { id: "impact", treeCount: 100, discountBps: 2500 },
] as const;

export type CampaignSponsorshipTier = (typeof CAMPAIGN_SPONSORSHIP_TIERS)[number];

export function getCampaignSponsorshipTier(id: string): CampaignSponsorshipTier | undefined {
  return CAMPAIGN_SPONSORSHIP_TIERS.find((tier) => tier.id === id);
}

export function getCampaignSponsorshipTierForCount(treeCount: number): CampaignSponsorshipTier {
  return [...CAMPAIGN_SPONSORSHIP_TIERS].reverse().find((tier) => treeCount >= tier.treeCount)
    ?? CAMPAIGN_SPONSORSHIP_TIERS[0];
}

export function getDiscountedSponsorshipAmount(amount: number, tier: CampaignSponsorshipTier): number {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * (10_000 - tier.discountBps)) / 10_000;
}

export interface CampaignSponsorshipImpactRecord {
  campaignId: string;
  tierId: CampaignSponsorshipTier["id"];
  treeCount: number;
  discountBps: number;
  selectedTreeIds: string[];
  recordedAt: number;
}

export function recordCampaignSponsorshipImpact(
  storage: Pick<Storage, "getItem" | "setItem">,
  record: CampaignSponsorshipImpactRecord,
): void {
  const key = `campaign-sponsorship-impact:${record.campaignId}`;
  const previous = storage.getItem(key);
  const history = previous ? JSON.parse(previous) as CampaignSponsorshipImpactRecord[] : [];
  storage.setItem(key, JSON.stringify([...history, record]));
}
