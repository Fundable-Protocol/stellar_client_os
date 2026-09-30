import { getCampaign } from "@/services/campaign.service";
import { buildCampaignSocialShareLinks } from "@/services/campaign-social-share.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/campaigns/:id/share — return pre-filled public Twitter/Facebook posts. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);

  if (!campaign) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  const result = buildCampaignSocialShareLinks(campaign, new URL(request.url).origin);
  return Response.json(result, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}