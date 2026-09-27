import { calculateCo2Offset } from "@/lib/co2-impact";
import { INITIAL_MOCK_SPONSORS, type Sponsor } from "@/types/sponsor";
import {
  HALL_OF_FAME_LIMIT,
  type HallOfFameBoard,
  type HallOfFameSponsor,
} from "@/types/campaign-hall-of-fame";
import { getCampaign } from "./campaign.service";

export { HALL_OF_FAME_LIMIT };

export interface HallOfFameSponsorInput {
  id: string;
  name?: string;
  address: string;
  avatarUrl?: string;
  amount: string;
  token?: string;
}

function parseAmount(amount: string): number {
  const value = Number.parseFloat(String(amount).replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Rank sponsors by contribution and attach trees / CO2 / funding share.
 */
export function buildHallOfFame(input: {
  campaignId: string;
  campaignTitle?: string;
  raisedAmount: string | number;
  treeCount: number;
  sponsors: HallOfFameSponsorInput[];
  limit?: number;
}): HallOfFameBoard {
  const limit = Math.max(1, input.limit ?? HALL_OF_FAME_LIMIT);
  const totalsFromSponsors = input.sponsors.reduce((sum, sponsor) => sum + parseAmount(sponsor.amount), 0);
  const raised = typeof input.raisedAmount === "number"
    ? input.raisedAmount
    : parseAmount(input.raisedAmount);
  const totalRaised = raised > 0 ? raised : totalsFromSponsors;
  const totalTrees = Math.max(0, Math.floor(input.treeCount) || 0);

  const ranked = [...input.sponsors]
    .map((sponsor) => ({ sponsor, amount: parseAmount(sponsor.amount) }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.sponsor.address.localeCompare(b.sponsor.address))
    .slice(0, limit)
    .map(({ sponsor, amount }, index): HallOfFameSponsor => {
      const fundingSharePercent = totalRaised > 0
        ? Math.round((amount / totalRaised) * 10_000) / 100
        : 0;
      const treesSponsored = totalTrees > 0 && totalRaised > 0
        ? Math.round((amount / totalRaised) * totalTrees)
        : 0;
      const co2OffsetKg = calculateCo2Offset("oak", treesSponsored).co2PerYearKg;
      return {
        rank: index + 1,
        sponsorId: sponsor.id,
        name: sponsor.name,
        address: sponsor.address,
        avatarUrl: sponsor.avatarUrl,
        amount,
        token: sponsor.token || "XLM",
        treesSponsored,
        co2OffsetKg,
        fundingSharePercent,
      };
    });

  return {
    campaignId: input.campaignId,
    campaignTitle: input.campaignTitle,
    totalRaised,
    totalTrees,
    totalCo2OffsetKg: calculateCo2Offset("oak", totalTrees).co2PerYearKg,
    sponsorCount: input.sponsors.length,
    sponsors: ranked,
  };
}

const DEMO_TREE_COUNT = 1_500;
const DEMO_RAISED = "33850";

export function getDemoHallOfFame(
  campaignId: string,
  limit = HALL_OF_FAME_LIMIT,
  sponsors: Sponsor[] = INITIAL_MOCK_SPONSORS,
): HallOfFameBoard {
  const campaignSponsors = sponsors.filter(
    (sponsor) => sponsor.campaignId === campaignId || campaignId === "demo" || campaignId === "camp-101",
  );
  return buildHallOfFame({
    campaignId,
    campaignTitle: "Save the Amazon RainForest Reserve",
    raisedAmount: DEMO_RAISED,
    treeCount: DEMO_TREE_COUNT,
    sponsors: campaignSponsors,
    limit,
  });
}

export async function getSponsorHallOfFame(
  campaignId: string,
  limit = HALL_OF_FAME_LIMIT,
): Promise<HallOfFameBoard> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return getDemoHallOfFame(campaignId, limit);

  const sponsors = campaign.sponsors.length > 0
    ? campaign.sponsors.map((sponsor) => ({
        id: sponsor.id,
        address: sponsor.address,
        amount: sponsor.amount,
        token: sponsor.token,
      }))
    : INITIAL_MOCK_SPONSORS.filter(
        (sponsor) => sponsor.campaignId === campaignId || campaignId === "camp-101",
      );

  return buildHallOfFame({
    campaignId,
    campaignTitle: campaign.name,
    raisedAmount: campaign.raisedAmount,
    treeCount: campaign.treeCount,
    sponsors,
    limit,
  });
}
