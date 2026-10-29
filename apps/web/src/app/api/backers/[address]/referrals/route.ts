import { NextResponse } from "next/server";
import { backersService } from "@/services/campaign-backers.service";
import { campaignReferralService } from "@/services/campaign-referral.service";
import { donationService } from "@/services/campaign-donation.service";
import { getCampaign } from "@/services/campaign.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * GET /api/backers/:address/referrals
 * Return one stable short link and attribution metrics for each campaign the
 * wallet has backed. `address` is the connected wallet used by the dashboard.
 */
export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address: rawAddress } = await params;
  const address = rawAddress.trim();
  if (!address || address.length > 128) {
    return NextResponse.json({ error: "A valid backer address is required" }, { status: 400, headers: NO_STORE });
  }

  const campaignIds = new Set([
    ...backersService.getCampaignIdsForBacker(address),
    ...donationService.getCampaignIdsForDonor(address),
  ]);
  const origin = new URL(request.url).origin;
  const campaigns = [];

  for (const campaignId of campaignIds) {
    const campaign = await getCampaign(campaignId);
    if (!campaign) continue;
    const link = campaignReferralService.createOrGetLink(campaignId, address);
    const stats = campaignReferralService.getStats(link.code, address);
    if (!stats) continue;
    campaigns.push({
      campaignId,
      campaignName: campaign.name,
      campaignUrl: new URL(`/r/${encodeURIComponent(link.code)}`, origin).toString(),
      code: link.code,
      ...stats,
      referralReward: campaign.referralReward ?? null,
    });
  }

  return NextResponse.json({ backerAddress: address, campaigns }, { headers: NO_STORE });
}
