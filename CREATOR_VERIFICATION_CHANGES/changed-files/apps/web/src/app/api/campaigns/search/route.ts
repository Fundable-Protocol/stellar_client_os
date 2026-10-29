import { getCampaignDataSource } from "@/services/campaign.service";
import { InMemoryCampaignSearchProvider, popularCampaigns } from "@/services/campaign-search.service";
import { resolveCreatorVerification } from "@/services/creator-identity-verification.service";

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
  const verifiedRaw = url.searchParams.get("verified");
  if (verifiedRaw !== null && verifiedRaw !== "true" && verifiedRaw !== "false") {
    return Response.json({ error: "verified must be true or false" }, { status: 400 });
  }
  const verifiedOnly = verifiedRaw === "true";

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
    || maxDaysRemaining !== undefined
    || verifiedOnly;
  if (!query && !hasFilters) {
    return Response.json({ error: "Provide a search query or at least one filter" }, { status: 400 });
  }

  const source = getCampaignDataSource();
  // Verification status is resolved live so newly earned badges surface in search immediately.
  const results = await new InMemoryCampaignSearchProvider(source, resolveCreatorVerification).search({
    query,
    location,
    category,
    species,
    creator,
    minGoalAmount,
    maxGoalAmount,
    maxDaysRemaining,
    verifiedOnly,
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
    verification: resolveCreatorVerification(campaign),
  })) : [];
  return Response.json({ data: results, count: results.length, suggestions });
}
