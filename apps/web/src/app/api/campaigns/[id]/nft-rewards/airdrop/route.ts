import { NextRequest, NextResponse } from "next/server";
import { campaignNFTRewardService, NFTRewardTierError } from "@/services/campaign-nft-reward.service";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

async function resolveCampaignId(context: RouteContext): Promise<string> {
  const resolved = await context.params;
  return resolved.id;
}

/**
 * GET /api/campaigns/[id]/nft-rewards/airdrop
 * List all airdropped NFTs for a campaign, or check a backer's wallet.
 * Optional query parameter: ?backerAddress=...
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const campaignId = await resolveCampaignId(context);
    const { searchParams } = new URL(request.url);
    const backerAddress = searchParams.get("backerAddress");

    if (backerAddress) {
      const backerNFTs = campaignNFTRewardService.getBackerRewardNFTs(backerAddress, campaignId);
      return NextResponse.json({ success: true, airdrops: backerNFTs }, { headers: NO_STORE });
    }

    const airdrops = campaignNFTRewardService.getCampaignAirdrops(campaignId);
    return NextResponse.json({ success: true, airdrops }, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load airdrops" },
      { status: 500, headers: NO_STORE }
    );
  }
}

/**
 * POST /api/campaigns/[id]/nft-rewards/airdrop
 * Acceptance Criteria 2 & 3:
 * Triggers post-campaign close minting and wallet airdrop to eligible backers.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const campaignId = await resolveCampaignId(context);
    const result = await campaignNFTRewardService.processCampaignCloseAirdrops(campaignId);
    return NextResponse.json({ success: true, result }, { status: 200, headers: NO_STORE });
  } catch (err) {
    if (err instanceof NFTRewardTierError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.code === "NOT_FOUND" ? 404 : err.code === "CAMPAIGN_NOT_CLOSED" ? 400 : 400, headers: NO_STORE }
      );
    }
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to process campaign close airdrops" },
      { status: 500, headers: NO_STORE }
    );
  }
}
