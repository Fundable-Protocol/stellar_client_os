import { getCampaignDataSource } from "@/services/campaign.service";
import { InMemoryCampaignSearchProvider } from "@/services/campaign-search.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (!query) return Response.json({ error: "q is required" }, { status: 400 });
  const results = await new InMemoryCampaignSearchProvider(getCampaignDataSource()).search({
    query,
    location: url.searchParams.get("location") ?? undefined,
    species: url.searchParams.get("species") ?? undefined,
    creator: url.searchParams.get("creator") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 20),
    offset: Number(url.searchParams.get("offset") ?? 0),
  });
  return Response.json({ data: results, count: results.length });
}
