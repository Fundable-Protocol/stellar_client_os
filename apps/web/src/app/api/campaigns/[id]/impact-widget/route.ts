import { getCampaign } from "@/services/campaign.service";
import { buildCampaignImpactWidgetData } from "@/services/campaign-impact-widget.service";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaign = await getCampaign((await params).id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  return Response.json(buildCampaignImpactWidgetData(campaign), {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
