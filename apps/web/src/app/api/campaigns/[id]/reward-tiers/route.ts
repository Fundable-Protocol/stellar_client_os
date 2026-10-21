import { NextRequest, NextResponse } from "next/server";
import { campaignInstalmentsService } from "@/services/campaign-instalments.service";
import { ConfigureRewardTierInput } from "@/types/campaign-instalments";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * GET  /api/campaigns/:id/reward-tiers
 * List reward tiers for a campaign
 *
 * POST /api/campaigns/:id/reward-tiers
 * Creator configures a reward tier (enabling or disabling instalment option)
 * Acceptance Criterion 1: Creator enables instalment option per reward tier
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const tiers = campaignInstalmentsService.getRewardTiers(id);
    return NextResponse.json({ success: true, rewardTiers: tiers }, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load reward tiers" },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      creatorAddress?: string;
      tier?: ConfigureRewardTierInput;
    };

    if (!body.creatorAddress?.trim()) {
      return NextResponse.json(
        { success: false, error: "creatorAddress is required" },
        { status: 400, headers: NO_STORE },
      );
    }

    if (!body.tier || !body.tier.name || !body.tier.amount) {
      return NextResponse.json(
        { success: false, error: "tier name and amount are required" },
        { status: 400, headers: NO_STORE },
      );
    }

    const tier = await campaignInstalmentsService.configureRewardTier(
      id,
      body.creatorAddress,
      body.tier,
    );

    return NextResponse.json({ success: true, rewardTier: tier }, { status: 201, headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to configure reward tier" },
      { status: 400, headers: NO_STORE },
    );
  }
}
