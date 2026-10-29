import { NextResponse } from "next/server";
import { getCampaign, getCampaignDataSource } from "@/services/campaign.service";
import { campaignReferralService } from "@/services/campaign-referral.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;
const sameAddress = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

/** Creator-only referral leaderboard and reward configuration. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404, headers: NO_STORE });

  const creator = new URL(request.url).searchParams.get("creator") ?? "";
  if (!creator || !sameAddress(campaign.creator, creator)) {
    return NextResponse.json({ error: "Only the campaign creator can view referral leaderboard stats" }, { status: 403, headers: NO_STORE });
  }

  return NextResponse.json({
    campaignId: id,
    referralReward: campaign.referralReward ?? null,
    leaderboard: campaignReferralService.getCampaignLeaderboard(id),
  }, { headers: NO_STORE });
}

/**
 * PUT /api/campaigns/:id/referrals
 * Set or clear the campaign's optional creator-defined reward for top referrers.
 * Send an empty rewardDescription to disable the reward.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404, headers: NO_STORE });

  let body: { creatorAddress?: unknown; rewardDescription?: unknown; recipientCount?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }
  if (typeof body.creatorAddress !== "string" || !sameAddress(campaign.creator, body.creatorAddress)) {
    return NextResponse.json({ error: "Only the campaign creator can configure a referral reward" }, { status: 403, headers: NO_STORE });
  }
  if (typeof body.rewardDescription !== "string" || body.rewardDescription.length > 500) {
    return NextResponse.json({ error: "rewardDescription must be a string of at most 500 characters" }, { status: 400, headers: NO_STORE });
  }

  const description = body.rewardDescription.trim();
  let referralReward: typeof campaign.referralReward;
  if (description) {
    const recipientCount = body.recipientCount === undefined ? 1 : Number(body.recipientCount);
    if (!Number.isInteger(recipientCount) || recipientCount < 1 || recipientCount > 10) {
      return NextResponse.json({ error: "recipientCount must be an integer from 1 to 10" }, { status: 400, headers: NO_STORE });
    }
    referralReward = { description, recipientCount, updatedAt: Date.now() };
  }

  const updated = await getCampaignDataSource().saveCampaign({ ...campaign, referralReward, updatedAt: Date.now() });
  return NextResponse.json({ campaignId: id, referralReward: updated.referralReward ?? null }, { headers: NO_STORE });
}
