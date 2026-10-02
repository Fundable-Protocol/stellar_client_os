import { getCampaign } from "@/services/campaign.service";
import { getCampaignRewardSummary } from "@/services/campaign-rewards.service";
import { checkCampaignRateLimit } from "@/lib/campaign-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaign = await getCampaign((await params).id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });

  const limited = await checkCampaignRateLimit(request, campaign);
  const headers = limited.allowed ? {} : limited.headers;
  if (!limited.allowed) {
    return Response.json(
      { error: "Too many requests", code: "RATE_LIMIT_EXCEEDED", retryAfter: headers["Retry-After"] },
      { status: 429, headers },
    );
  }

  const summary = getCampaignRewardSummary(campaign);
  return Response.json(
    {
      ...summary,
      fundingTier: limited.tier.tier,
      requestsPerHour: limited.tier.requestsPerHour,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "RateLimit-Limit": String(limited.result.limit),
        "RateLimit-Remaining": String(limited.result.remaining),
        "RateLimit-Reset": String(Math.max(1, Math.ceil((limited.result.resetAt - Date.now()) / 1000))),
      },
    },
  );
}
