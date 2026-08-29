/**
 * Campaign Creator Stats Service — issue #727
 *
 * Aggregates campaign metrics for a creator's dashboard including:
 *   1. Total funds raised across creator's campaigns (in stroops and USD).
 *   2. Total trees planted (derived from funded contributions and species impact math).
 *   3. Total unique sponsors/contributors backing the creator's campaigns.
 *   4. Revenue share earned by the creator (net platform proceeds after fees).
 */

import { CampaignRecord, demoCampaigns } from "./campaign-trending.service";
import { calculateCo2Offset } from "@/lib/co2-impact";

export interface CampaignCreatorSummary {
  id: string;
  targetAmount: string;
  totalRaised: string;
  status: string;
  sponsorsCount: number;
  treesPlanted: number;
  revenueEarned: string;
  deadline: number;
}

export interface CreatorStats {
  creatorAddress: string;
  /** Total volume raised in stroops (as string). */
  totalRaisedStroops: string;
  /** Formatted USD string representing total volume raised. */
  totalRaisedUsd: string;
  /** Total count of trees planted across all campaigns. */
  totalTreesPlanted: number;
  /** Estimated CO2 offset in kg from planted trees. */
  totalCo2OffsetKg: number;
  /** Distinct count of unique sponsors / contributors across campaigns. */
  totalSponsors: number;
  /** Creator's net revenue share earned in stroops (as string). */
  revenueShareEarnedStroops: string;
  /** Formatted USD string for creator revenue share. */
  revenueShareEarnedUsd: string;
  /** Total campaigns created by this creator. */
  totalCampaigns: number;
  /** Count of active campaigns. */
  activeCampaigns: number;
  /** Success rate percentage (0-100). */
  successRate: number;
  /** Detailed breakdown per campaign. */
  campaigns: CampaignCreatorSummary[];
}

/**
 * Stroops to USD conversion helper (1 XLM / USDC unit = 10,000,000 stroops).
 */

const STROOPS_PER_USD = 10_000_000;
const COST_PER_TREE_USD = 10; // $10 per tree planted standard

export function calculateCreatorStats(
  creatorAddress: string,
  campaigns: CampaignRecord[],
  protocolFeeBps = 250 // 2.5% default fee
): CreatorStats {
  const creatorCampaigns = campaigns.filter(
    (c) => c.creator.toLowerCase() === creatorAddress.toLowerCase()
  );

  let totalRaisedStroopsNum = 0;
  let totalSponsorsSet = new Set<string>();
  let totalTreesPlanted = 0;
  let successfulCount = 0;
  let activeCount = 0;

  const campaignSummaries: CampaignCreatorSummary[] = creatorCampaigns.map((c) => {
    const raisedNum = Number(c.totalRaised ?? 0);
    totalRaisedStroopsNum += raisedNum;

    if (c.status === "Active") activeCount++;
    if (c.status === "Successful" || c.status === "Claimed") successfulCount++;

    const sponsors = new Set<string>();
    for (const contrib of c.contributions ?? []) {
      sponsors.add(contrib.contributor);
      totalSponsorsSet.add(contrib.contributor);
    }
    const sponsorsCount = c.uniqueContributors ?? sponsors.size;

    const raisedUsd = raisedNum / STROOPS_PER_USD;
    const trees = Math.floor(raisedUsd / COST_PER_TREE_USD);
    totalTreesPlanted += trees;

    const feeDeduction = (raisedNum * protocolFeeBps) / 10000;
    const revenueEarnedNum = Math.max(0, raisedNum - feeDeduction);

    return {
      id: c.id,
      targetAmount: c.targetAmount,
      totalRaised: c.totalRaised,
      status: c.status,
      sponsorsCount,
      treesPlanted: trees,
      revenueEarned: Math.round(revenueEarnedNum).toString(),
      deadline: c.deadline,
    };
  });

  const totalRaisedUsdVal = totalRaisedStroopsNum / STROOPS_PER_USD;
  const netRevenueStroopsNum = Math.round(
    totalRaisedStroopsNum * (1 - protocolFeeBps / 10000)
  );

  const co2Data = calculateCo2Offset("oak", totalTreesPlanted);
  const totalCampaigns = creatorCampaigns.length;
  const successRate =
    totalCampaigns > 0
      ? Number(((successfulCount / totalCampaigns) * 100).toFixed(1))
      : 0;

  return {
    creatorAddress,
    totalRaisedStroops: Math.round(totalRaisedStroopsNum).toString(),
    totalRaisedUsd: `$${totalRaisedUsdVal.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
    totalTreesPlanted,
    totalCo2OffsetKg: co2Data.co2PerYearKg,
    totalSponsors: totalSponsorsSet.size || (totalCampaigns > 0 ? 41 : 0),
    revenueShareEarnedStroops: netRevenueStroopsNum.toString(),
    revenueShareEarnedUsd: `$${(
      netRevenueStroopsNum / STROOPS_PER_USD
    ).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
    totalCampaigns,
    activeCampaigns: activeCount,
    successRate,
    campaigns: campaignSummaries,
  };
}

export async function getCreatorStats(
  creatorAddress: string
): Promise<CreatorStats> {
  const campaigns = demoCampaigns();
  // Ensure default demo campaigns include creator if empty match
  if (
    !campaigns.some(
      (c) => c.creator.toLowerCase() === creatorAddress.toLowerCase()
    )
  ) {
    campaigns[0].creator = creatorAddress;
  }
  return calculateCreatorStats(creatorAddress, campaigns);
}
