import { NextRequest, NextResponse } from "next/server";
import { campaignNFTRewardService, NFTRewardTierError } from "@/services/campaign-nft-reward.service";
import { DefineNFTRewardTierInput } from "@/types/campaign-reward-nft";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

async function resolveCampaignId(context: RouteContext): Promise<string> {
  const resolved = await context.params;
  return resolved.id;
}

/**
 * GET /api/campaigns/[id]/nft-rewards
 * List all configured NFT reward tiers for a campaign.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const campaignId = await resolveCampaignId(context);
    const tiers = campaignNFTRewardService.getNFTRewardTiers(campaignId);
    return NextResponse.json({ success: true, nftRewardTiers: tiers }, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load NFT reward tiers" },
      { status: 500, headers: NO_STORE }
    );
  }
}

/**
 * POST /api/campaigns/[id]/nft-rewards
 * Acceptance Criterion 1: Creator defines NFT reward tier and uploads asset.
 * Body: { creatorAddress: string, tier: DefineNFTRewardTierInput }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const campaignId = await resolveCampaignId(context);
    const body = (await request.json().catch(() => ({}))) as {
      creatorAddress?: string;
      tier?: DefineNFTRewardTierInput;
    };

    if (!body.creatorAddress?.trim()) {
      return NextResponse.json(
        { success: false, error: "creatorAddress is required" },
        { status: 400, headers: NO_STORE }
      );
    }

    if (!body.tier || !body.tier.name || !body.tier.minimumPledge || !body.tier.asset) {
      return NextResponse.json(
        { success: false, error: "tier name, minimumPledge, and asset are required" },
        { status: 400, headers: NO_STORE }
      );
    }

    const tier = await campaignNFTRewardService.defineNFTRewardTier(
      campaignId,
      body.creatorAddress,
      body.tier
    );

    return NextResponse.json({ success: true, nftRewardTier: tier }, { status: 201, headers: NO_STORE });
  } catch (err) {
    if (err instanceof NFTRewardTierError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.code === "NOT_FOUND" ? 404 : 400, headers: NO_STORE }
      );
    }
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to define NFT reward tier" },
      { status: 500, headers: NO_STORE }
    );
  }
}
