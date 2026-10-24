import { getCampaignDataSource } from "@/services/campaign.service";
import { InMemoryCampaignSearchProvider, popularCampaigns } from "@/services/campaign-search.service";

export const runtime = "nodejs";

const AMOUNT_PATTERN = /^\d+$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const location = url.searchParams.get("location") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const species = url.searchParams.get("species") ?? undefined;
  const creator = url.searchParams.get("creator") ?? undefined;
  const minGoalAmount = url.searchParams.get("minGoalAmount") ?? undefined;
  const maxGoalAmount = url.searchParams.get("maxGoalAmount") ?? undefined;
  const maxDaysRemainingRaw = url.searchParams.get("maxDaysRemaining");

  if (minGoalAmount !== undefined && !AMOUNT_PATTERN.test(minGoalAmount)) {
    return Response.json({ error: "minGoalAmount must be a non-negative integer string" }, { status: 400 });
  }
  if (maxGoalAmount !== undefined && !AMOUNT_PATTERN.test(maxGoalAmount)) {
    return Response.json({ error: "maxGoalAmount must be a non-negative integer string" }, { status: 400 });
  }
  if (minGoalAmount !== undefined && maxGoalAmount !== undefined && BigInt(minGoalAmount) > BigInt(maxGoalAmount)) {
    return Response.json({ error: "minGoalAmount must not exceed maxGoalAmount" }, { status: 400 });
  }
  let maxDaysRemaining: number | undefined;
  if (maxDaysRemainingRaw !== null) {
    maxDaysRemaining = Number(maxDaysRemainingRaw);
    if (!Number.isFinite(maxDaysRemaining) || maxDaysRemaining < 0) {
      return Response.json({ error: "maxDaysRemaining must be a non-negative number" }, { status: 400 });
    }
  }

  const hasFilters = Boolean(location || category || species || creator)
    || minGoalAmount !== undefined
    || maxGoalAmount !== undefined
    || maxDaysRemaining !== undefined;
  if (!query && !hasFilters) {
    return Response.json({ error: "Provide a search query or at least one filter" }, { status: 400 });
  }

  const source = getCampaignDataSource();
  const results = await new InMemoryCampaignSearchProvider(source).search({
    query,
    location,
    category,
    species,
    creator,
    minGoalAmount,
    maxGoalAmount,
    maxDaysRemaining,
    limit: Number(url.searchParams.get("limit") ?? 20),
    offset: Number(url.searchParams.get("offset") ?? 0),
  });
  // Empty state: suggest popular campaigns so the search bar is never a dead end.
  const suggestions = results.length === 0 ? popularCampaigns(await source.getCampaigns()).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    location: campaign.location,
    category: campaign.category,
    sponsorCount: campaign.sponsorCount,
  })) : [];
  return Response.json({ data: results, count: results.length, suggestions });
}
