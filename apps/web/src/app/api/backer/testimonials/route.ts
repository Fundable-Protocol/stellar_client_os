import { backersService } from "@/services/campaign-backers.service";
import { queryCampaigns } from "@/services/campaign.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const backerAddress = new URL(request.url).searchParams.get("backerAddress")?.trim();
  if (!backerAddress) return Response.json({ error: "backerAddress is required" }, { status: 400 });

  const campaigns = await queryCampaigns({ limit: 500 });
  const backedCampaigns = campaigns
    .filter((campaign) =>
      backersService.getContributions(campaign.id).some(
        (contribution) => contribution.backerAddress.toLowerCase() === backerAddress.toLowerCase(),
      ),
    )
    .map(({ id, name }) => ({ id, name }));

  return Response.json({ campaigns: backedCampaigns }, { headers: { "Cache-Control": "private, no-store" } });
}
