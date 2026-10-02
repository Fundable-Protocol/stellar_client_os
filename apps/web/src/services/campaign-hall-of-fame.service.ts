/**
 * Campaign Sponsor Hall of Fame Service
 *
 * Issue #904: feat(frontend): Campaign sponsor hall of fame - top contributors
 *
 * Computes ranked top contributors for any campaign with:
 * - Rank (#1, #2, #3, ...)
 * - Total trees sponsored (proportional to contribution share)
 * - Total CO2 offset (kg and tonnes)
 * - % of campaign funding provided by that sponsor
 */

import { getCampaign, type CampaignRecord } from "./campaign.service";
import { INITIAL_MOCK_SPONSORS, type Sponsor, type SponsorTier, calculateSponsorTier, formatTruncatedAddress } from "@/types/sponsor";

export interface HallOfFameSponsor {
  rank: number;
  id: string;
  name: string;
  address: string;
  formattedAddress: string;
  avatarUrl: string;
  tier: SponsorTier;
  amount: number;
  amountFormatted: string;
  token: string;
  treesSponsored: number;
  co2OffsetKg: number;
  co2OffsetTonnes: string;
  fundingPercentage: number;
  fundingPercentageFormatted: string;
  sponsoredAt: number;
  message?: string;
  badgeTitle?: string;
}

export interface CampaignHallOfFameSummary {
  campaignId: string;
  campaignName: string;
  totalRaised: string;
  totalTrees: number;
  totalSponsorsCount: number;
  topSponsors: HallOfFameSponsor[];
}

const DEFAULT_AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80",
];

const CO2_KG_PER_TREE_PER_YEAR = 20;

function getBadgeTitle(rank: number): string {
  switch (rank) {
    case 1:
      return "🥇 Lead Forest Guardian";
    case 2:
      return "🥈 Canopy Champion";
    case 3:
      return "🥉 Biosphere Steward";
    case 4:
    case 5:
      return "🌟 Top Patron";
    default:
      return "🌿 Eco Contributor";
  }
}

/**
 * Computes hall of fame top contributors for a campaign.
 */
export async function getCampaignHallOfFame(
  campaignId: string,
  limit = 10
): Promise<CampaignHallOfFameSummary | null> {
  const campaign = await getCampaign(campaignId);

  // Raw sponsors from campaign or initial mock fallback
  let rawSponsors: Array<{
    id?: string;
    name?: string;
    address: string;
    amount: string;
    token?: string;
    sponsoredAt?: number;
    avatarUrl?: string;
    message?: string;
  }> = [];

  if (campaign && campaign.sponsors && campaign.sponsors.length > 0) {
    rawSponsors = campaign.sponsors.map((s, idx) => ({
      ...s,
      avatarUrl: DEFAULT_AVATARS[idx % DEFAULT_AVATARS.length],
    }));
  } else {
    // Fallback to mock sponsors for rich display
    rawSponsors = INITIAL_MOCK_SPONSORS;
  }

  // Aggregate contributions by address
  const aggregated = new Map<
    string,
    {
      id: string;
      name: string;
      address: string;
      avatarUrl: string;
      totalAmount: number;
      token: string;
      latestSponsoredAt: number;
      message?: string;
    }
  >();

  for (let i = 0; i < rawSponsors.length; i++) {
    const s = rawSponsors[i];
    const amt = parseFloat(s.amount) || 0;
    const existing = aggregated.get(s.address);
    if (existing) {
      existing.totalAmount += amt;
      if (s.sponsoredAt && s.sponsoredAt > existing.latestSponsoredAt) {
        existing.latestSponsoredAt = s.sponsoredAt;
      }
      if (s.message && !existing.message) existing.message = s.message;
    } else {
      aggregated.set(s.address, {
        id: s.id || `sp-${i + 1}`,
        name: s.name || `Sponsor ${s.address.slice(0, 4)}`,
        address: s.address,
        avatarUrl: s.avatarUrl || DEFAULT_AVATARS[i % DEFAULT_AVATARS.length],
        totalAmount: amt,
        token: s.token || "XLM",
        latestSponsoredAt: s.sponsoredAt || Date.now() - (i + 1) * 3600000,
        message: s.message,
      });
    }
  }

  const list = Array.from(aggregated.values());
  // Sort descending by total amount
  list.sort((a, b) => b.totalAmount - a.totalAmount);

  // Calculate campaign total funding pool
  const campaignTreeCount = campaign?.treeCount || 5000;
  const campaignRaisedNum = campaign ? parseFloat(campaign.raisedAmount) || 0 : 0;
  const totalFunding = Math.max(
    campaignRaisedNum,
    list.reduce((sum, item) => sum + item.totalAmount, 0),
    1
  );

  const topSponsors: HallOfFameSponsor[] = list.slice(0, limit).map((item, index) => {
    const rank = index + 1;
    const fundingPercentage = Math.round((item.totalAmount / totalFunding) * 1000) / 10;
    const fundingFraction = item.totalAmount / totalFunding;
    const treesSponsored = Math.max(1, Math.round(campaignTreeCount * fundingFraction));
    const co2OffsetKg = treesSponsored * CO2_KG_PER_TREE_PER_YEAR;
    const co2OffsetTonnes = (co2OffsetKg / 1000).toFixed(2);

    return {
      rank,
      id: item.id,
      name: item.name,
      address: item.address,
      formattedAddress: formatTruncatedAddress(item.address),
      avatarUrl: item.avatarUrl,
      tier: calculateSponsorTier(item.totalAmount.toString()),
      amount: item.totalAmount,
      amountFormatted: item.totalAmount.toLocaleString(),
      token: item.token,
      treesSponsored,
      co2OffsetKg,
      co2OffsetTonnes,
      fundingPercentage,
      fundingPercentageFormatted: `${fundingPercentage.toFixed(1)}%`,
      sponsoredAt: item.latestSponsoredAt,
      message: item.message,
      badgeTitle: getBadgeTitle(rank),
    };
  });

  return {
    campaignId,
    campaignName: campaign?.name || "Forest Restoration Campaign",
    totalRaised: totalFunding.toLocaleString(),
    totalTrees: campaignTreeCount,
    totalSponsorsCount: list.length,
    topSponsors,
  };
}
