/** Fixed-point basis-point scale used for deterministic campaign multipliers. */
export const MULTIPLIER_BPS = 10_000;

export type CampaignDemandTier = "baseline" | "warming" | "high-demand" | "fully-funded";

export interface CampaignDemandPricingInput {
  baseCostPerTree: bigint | number | string;
  targetAmount: bigint | number | string;
  totalRaised: bigint | number | string;
}

export interface CampaignDemandPricing {
  baseCostPerTree: bigint;
  adjustedCostPerTree: bigint;
  demandBps: bigint;
  multiplierBps: number;
  tier: CampaignDemandTier;
}

function nonNegative(value: bigint | number | string): bigint {
  const parsed = typeof value === "bigint" ? value : BigInt(String(value));
  return parsed < 0n ? 0n : parsed;
}

/**
 * Return the demand tier for a campaign. Demand is measured against the hard
 * funding target and is capped at 100%, so overfunding cannot amplify price
 * indefinitely.
 */
export function getCampaignDemandTier(demandBps: bigint): CampaignDemandTier {
  if (demandBps >= MULTIPLIER_BPS) return "fully-funded";
  if (demandBps >= 9_000n) return "high-demand";
  if (demandBps >= 7_000n) return "warming";
  return "baseline";
}

/**
 * Calculate a supply/demand price without floating point arithmetic.
 *
 * Rules: below 70% funded is baseline pricing, 70–89% is 10% higher, 90–99%
 * is 25% higher, and a fully-funded campaign is 50% higher. Integer division
 * rounds down so a price never exceeds the configured multiplier.
 */
export function calculateCampaignDemandPricing(input: CampaignDemandPricingInput): CampaignDemandPricing {
  const baseCostPerTree = nonNegative(input.baseCostPerTree);
  const targetAmount = nonNegative(input.targetAmount);
  const totalRaised = nonNegative(input.totalRaised);
  const demandBps = targetAmount === 0n
    ? 0n
    : (totalRaised * BigInt(MULTIPLIER_BPS)) / targetAmount;
  const cappedDemandBps = demandBps > BigInt(MULTIPLIER_BPS) ? BigInt(MULTIPLIER_BPS) : demandBps;
  const tier = getCampaignDemandTier(cappedDemandBps);
  const multiplierBps = tier === "fully-funded" ? 15_000 : tier === "high-demand" ? 12_500 : tier === "warming" ? 11_000 : 10_000;
  return {
    baseCostPerTree,
    adjustedCostPerTree: (baseCostPerTree * BigInt(multiplierBps)) / BigInt(MULTIPLIER_BPS),
    demandBps: cappedDemandBps,
    multiplierBps,
    tier,
  };
}

export type CampaignSeason = "earth-month" | "arbor-day" | "rainy-season" | "standard";

/** Return the campaign season used by the carbon-credit multiplier rules. */
export function getCampaignSeason(dateOrTimestamp: Date | number): CampaignSeason {
  const date = typeof dateOrTimestamp === "number" ? new Date(dateOrTimestamp * 1000) : dateOrTimestamp;
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (month === 4) return "earth-month";
  if (month === 3 && day === 21) return "arbor-day";
  if (month >= 5 && month <= 10) return "rainy-season";
  return "standard";
}

/**
 * Seasonal carbon-credit multiplier in basis points. April and Arbor Day use
 * 1.5x, rainy season uses 2x; otherwise the base rate is unchanged.
 */
export function getCampaignCreditMultiplierBps(dateOrTimestamp: Date | number): number {
  const season = getCampaignSeason(dateOrTimestamp);
  return season === "rainy-season" ? 20_000 : season === "earth-month" || season === "arbor-day" ? 15_000 : 10_000;
}

export function calculateCampaignCarbonCredits(treeCount: bigint | number | string, dateOrTimestamp: Date | number): bigint {
  const trees = nonNegative(treeCount);
  return (trees * BigInt(getCampaignCreditMultiplierBps(dateOrTimestamp))) / BigInt(MULTIPLIER_BPS);
}
