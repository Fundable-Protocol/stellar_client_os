import { getRedisClient } from "./redis";
import {
  RateLimiter,
  buildRateLimitHeaders,
  type RateLimitResult,
} from "./rate-limit";
import { extractIp } from "@/middlewares/rate-limit.middleware";
import type { CampaignRecord } from "@/services/campaign.service";

export type CampaignFundingTier = "basic" | "pro" | "enterprise";

export interface CampaignFundingTierConfig {
  tier: CampaignFundingTier;
  /** Funding goal in the smallest token unit. */
  maxGoalAmountExclusive: bigint | null;
  requestsPerHour: number;
}

export const CAMPAIGN_FUNDING_TIERS: Record<CampaignFundingTier, CampaignFundingTierConfig> = {
  basic: { tier: "basic", maxGoalAmountExclusive: 10_000n, requestsPerHour: 100 },
  pro: { tier: "pro", maxGoalAmountExclusive: 100_000n, requestsPerHour: 1_000 },
  enterprise: { tier: "enterprise", maxGoalAmountExclusive: null, requestsPerHour: 10_000 },
};

export function resolveCampaignFundingTier(goalAmount: string | number | bigint): CampaignFundingTierConfig {
  let amount = 0n;
  try {
    amount = BigInt(String(goalAmount));
  } catch {
    amount = 0n;
  }
  if (amount < CAMPAIGN_FUNDING_TIERS.basic.maxGoalAmountExclusive!) return CAMPAIGN_FUNDING_TIERS.basic;
  if (amount < CAMPAIGN_FUNDING_TIERS.pro.maxGoalAmountExclusive!) return CAMPAIGN_FUNDING_TIERS.pro;
  return CAMPAIGN_FUNDING_TIERS.enterprise;
}

const limiters = new Map<CampaignFundingTier, RateLimiter>();
function getCampaignLimiter(config: CampaignFundingTierConfig): RateLimiter {
  const existing = limiters.get(config.tier);
  if (existing) return existing;
  const limiter = new RateLimiter(getRedisClient(), {
    limit: config.requestsPerHour,
    windowMs: 60 * 60 * 1_000,
    keyPrefix: `rl:campaign:${config.tier}`,
  });
  limiters.set(config.tier, limiter);
  return limiter;
}

export async function checkCampaignRateLimit(
  request: Request,
  campaign: Pick<CampaignRecord, "id" | "goalAmount" | "fundingTier">,
): Promise<{ allowed: true; tier: CampaignFundingTierConfig; result: RateLimitResult } | { allowed: false; tier: CampaignFundingTierConfig; result: RateLimitResult; headers: Record<string, string> }> {
  const tier = campaign.fundingTier ? CAMPAIGN_FUNDING_TIERS[campaign.fundingTier] : resolveCampaignFundingTier(campaign.goalAmount);
  const identifier = `${extractIp(request as Parameters<typeof extractIp>[0])}:${campaign.id}`;
  const result = await getCampaignLimiter(tier).check(identifier);
  if (!result.allowed) return { allowed: false, tier, result, headers: buildRateLimitHeaders(result) };
  return { allowed: true, tier, result };
}

export function resetCampaignRateLimitersForTests(): void {
  limiters.clear();
}
