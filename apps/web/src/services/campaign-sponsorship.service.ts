import { formatTokenAmount, parseTokenAmount } from "@/types/campaign-backers";

export type SponsorshipTier = "NONE" | "TREE_10" | "TREE_50" | "TREE_100";

export interface SponsorshipPricing {
  treeCount: number;
  tier: SponsorshipTier;
  discountRateBps: number;
  discountPercent: number;
  grossAmount: string;
  discountAmount: string;
  netAmount: string;
}

export function getSponsorshipTier(treeCount: number): { tier: SponsorshipTier; discountRateBps: number } {
  if (!Number.isSafeInteger(treeCount) || treeCount < 1) {
    throw new Error("treeCount must be a positive integer");
  }
  if (treeCount >= 100) return { tier: "TREE_100", discountRateBps: 2500 };
  if (treeCount >= 50) return { tier: "TREE_50", discountRateBps: 1500 };
  if (treeCount >= 10) return { tier: "TREE_10", discountRateBps: 500 };
  return { tier: "NONE", discountRateBps: 0 };
}

/** Calculate the net amount using the repository's 7-decimal Stellar token scale. */
export function calculateSponsorshipPricing(grossAmount: string, treeCount: number): SponsorshipPricing {
  const parsed = parseTokenAmount(grossAmount);
  if (parsed === null || parsed <= 0n) throw new Error("A positive gross amount is required");
  const { tier, discountRateBps } = getSponsorshipTier(treeCount);
  const discount = (parsed * BigInt(discountRateBps)) / 10_000n;
  const net = parsed - discount;
  return {
    treeCount,
    tier,
    discountRateBps,
    discountPercent: discountRateBps / 100,
    grossAmount: formatTokenAmount(parsed),
    discountAmount: formatTokenAmount(discount),
    netAmount: formatTokenAmount(net),
  };
}
