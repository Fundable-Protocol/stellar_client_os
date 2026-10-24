/**
 * Campaign Boost & Paid Promotion Types — Issue #1207
 *
 * Allow creators to pay a fee to boost their campaign to featured placement
 * in search results, the homepage, and category pages.
 */

export type BoostPlacement = "HOMEPAGE" | "SEARCH" | "CATEGORY";
export type BoostDurationDays = 3 | 7 | 14 | 30;
export type BoostStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED";
export type BoostToken = "XLM" | "USDC";

export interface BoostPricingTier {
  durationDays: BoostDurationDays;
  placements: BoostPlacement[];
  pricePerDay: string;
  totalPrice: string;
  token: BoostToken;
  label: string;
  description: string;
}

export interface CampaignBoost {
  id: string;
  campaignId: string;
  creatorAddress: string;
  placements: BoostPlacement[];
  durationDays: BoostDurationDays;
  startDate: number;
  endDate: number;
  totalPaid: string;
  token: BoostToken;
  txHash?: string;
  status: BoostStatus;
  createdAt: number;
}

export interface PurchaseBoostInput {
  campaignId: string;
  creatorAddress: string;
  placements: BoostPlacement[];
  durationDays: BoostDurationDays;
  token: BoostToken;
  idempotencyKey?: string;
}

/** Default pricing catalogue shown in the self-serve boost purchase flow. */
export const BOOST_PRICING_CATALOGUE: BoostPricingTier[] = [
  {
    durationDays: 3,
    placements: ["SEARCH"],
    pricePerDay: "5.00",
    totalPrice: "15.00",
    token: "USDC",
    label: "Starter Boost",
    description: "3 days in search results",
  },
  {
    durationDays: 7,
    placements: ["SEARCH", "CATEGORY"],
    pricePerDay: "8.00",
    totalPrice: "56.00",
    token: "USDC",
    label: "Growth Boost",
    description: "7 days in search & category pages",
  },
  {
    durationDays: 14,
    placements: ["HOMEPAGE", "SEARCH", "CATEGORY"],
    pricePerDay: "12.00",
    totalPrice: "168.00",
    token: "USDC",
    label: "Featured Boost",
    description: "14 days homepage + search + category",
  },
  {
    durationDays: 30,
    placements: ["HOMEPAGE", "SEARCH", "CATEGORY"],
    pricePerDay: "10.00",
    totalPrice: "300.00",
    token: "USDC",
    label: "Premium Boost",
    description: "30 days — best value, all placements",
  },
];

export const PLACEMENT_LABELS: Record<BoostPlacement, string> = {
  HOMEPAGE: "Homepage",
  SEARCH: "Search Results",
  CATEGORY: "Category Pages",
};
