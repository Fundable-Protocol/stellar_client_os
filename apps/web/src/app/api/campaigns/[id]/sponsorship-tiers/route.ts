import { getCampaign } from "@/services/campaign.service";
import {
  CAMPAIGN_SPONSORSHIP_TIERS,
  getCampaignSponsorshipTier,
  getCampaignSponsorshipTierForCount,
  getDiscountedSponsorshipAmount,
  CampaignSponsorshipImpactRecord,
} from "@/lib/campaign-sponsorship-tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory backing store for impact tracking per campaign
const impactStore = new Map<string, CampaignSponsorshipImpactRecord[]>();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaign = await getCampaign(id);

  if (!campaign) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const countParam = url.searchParams.get("treeCount");
  const baseCostPerTree = 10; // Default XLM per tree

  let calculated = null;
  if (countParam) {
    const treeCount = parseInt(countParam, 10);
    if (!isNaN(treeCount) && treeCount > 0) {
      const tier = getCampaignSponsorshipTierForCount(treeCount);
      const grossAmount = treeCount * baseCostPerTree;
      const netAmount = getDiscountedSponsorshipAmount(grossAmount, tier);
      const savings = grossAmount - netAmount;

      calculated = {
        treeCount,
        tierId: tier.id,
        discountPercentage: tier.discountBps / 100,
        grossAmount,
        netAmount,
        savings,
      };
    }
  }

  const history = impactStore.get(id) ?? [];

  return Response.json({
    campaignId: id,
    tiers: CAMPAIGN_SPONSORSHIP_TIERS.map((tier) => ({
      id: tier.id,
      treeCount: tier.treeCount,
      discountPercentage: tier.discountBps / 100,
      description: `${tier.treeCount}+ trees: ${tier.discountBps / 100}% bulk discount`,
    })),
    calculated,
    totalTrackedSponsorships: history.length,
    recentImpactRecords: history.slice(-10),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaign = await getCampaign(id);

  if (!campaign) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    treeCount?: number;
    tierId?: string;
    selectedTreeIds?: string[];
    isAnonymous?: boolean;
  };

  const treeCount = body.treeCount ?? 10;
  if (treeCount < 10) {
    return Response.json(
      { error: "Minimum bulk purchase tier starts at 10 trees" },
      { status: 400 }
    );
  }

  const tier = body.tierId
    ? getCampaignSponsorshipTier(body.tierId) ?? getCampaignSponsorshipTierForCount(treeCount)
    : getCampaignSponsorshipTierForCount(treeCount);

  const baseCostPerTree = 10;
  const grossAmount = treeCount * baseCostPerTree;
  const netAmount = getDiscountedSponsorshipAmount(grossAmount, tier);

  const record: CampaignSponsorshipImpactRecord = {
    campaignId: id,
    tierId: tier.id,
    treeCount,
    discountBps: tier.discountBps,
    selectedTreeIds: body.selectedTreeIds ?? Array.from({ length: treeCount }, (_, i) => `tree-${id}-${Date.now()}-${i}`),
    recordedAt: Date.now(),
    isAnonymous: body.isAnonymous ?? false,
  };

  const existing = impactStore.get(id) ?? [];
  existing.push(record);
  impactStore.set(id, existing);

  return Response.json({
    success: true,
    campaignId: id,
    tier: {
      id: tier.id,
      discountPercentage: tier.discountBps / 100,
    },
    pricing: {
      treeCount,
      grossAmount,
      netAmount,
      savings: grossAmount - netAmount,
    },
    impactRecord: record,
  });
}