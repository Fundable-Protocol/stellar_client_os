// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  DAY_SECONDS,
  DEFAULT_WEIGHTS,
  NEUTRAL_COMPLETION_PRIOR,
  calculateDailyVelocity,
  calculateEngagementRate,
  calculateCompletionProbability,
  campaignProgress,
  engagementMetric,
  normalizeWeights,
  scoreTrendingCampaigns,
  CampaignTrendingService,
  weightsFromEnv,
  type CampaignRecord,
  type CampaignDataSource,
} from "./campaign-trending.service";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USDC = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

function makeCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "1",
    creator: "GCREATOR",
    token: USDC,
    targetAmount: "100000",
    minTarget: "50000",
    createdAt: 100000,
    deadline: 900000,
    totalRaised: "20000",
    status: "Active",
    ...overrides,
  };
}

/** Inline data source backed by a fixture list. */
function withCampaigns(campaigns: CampaignRecord[]): CampaignDataSource {
  return { getCampaigns: async () => campaigns };
}

const TEN = 10 * DAY_SECONDS;

// ── dailyVelocity ─────────────────────────────────────────────────────────────

describe("calculateDailyVelocity", () => {
  it("sums contribution volume within the trailing 24 h window", () => {
    const now = 200_000;
    const campaign = makeCampaign({
      contributions: [
        { contributor: "GAAA", amount: "1000", timestamp: now - 3600 }, // within
        { contributor: "GBBB", amount: "2500", timestamp: now - 12 * 3600 }, // within
        { contributor: "GCCC", amount: "9999", timestamp: now - 48 * 3600 }, // before window
      ],
    });
    expect(calculateDailyVelocity(campaign, now)).toBe(3500);
  });

  it("returns 0 with no contribution data", () => {
    const campaign = makeCampaign({ contributions: undefined });
    expect(calculateDailyVelocity(campaign, 200_000)).toBe(0);
  });
});

// ── engagementRate ────────────────────────────────────────────────────────────

describe("calculateEngagementRate", () => {
  it("uses provided unique/contribution counts", () => {
    const campaign = makeCampaign({
      uniqueContributors: 10,
      contributionCount: 50,
    });
    expect(calculateEngagementRate(campaign)).toBe(0.2);
  });

  it("derives counts from contributions when not provided", () => {
    const campaign = makeCampaign({
      contributions: [
        { contributor: "GAAA", amount: "1", timestamp: 1 },
        { contributor: "GAAA", amount: "1", timestamp: 2 },
        { contributor: "GBBB", amount: "1", timestamp: 3 },
      ],
    });
    expect(calculateEngagementRate(campaign)).toBeCloseTo(2 / 3, 5);
  });

  it("returns 0 with no engagement data", () => {
    expect(calculateEngagementRate(makeCampaign())).toBe(0);
  });
});

// ── engagementMetric ──────────────────────────────────────────────────────────

describe("engagementMetric", () => {
  it("rewards broad, larger communities over a single whale", () => {
    const broad = makeCampaign({ uniqueContributors: 30, contributionCount: 30 });
    const whale = makeCampaign({ uniqueContributors: 1, contributionCount: 30 });
    expect(engagementMetric(broad)).toBeGreaterThan(engagementMetric(whale));
  });

  it("returns 0 when there is no engagement data", () => {
    expect(engagementMetric(makeCampaign())).toBe(0);
  });
});

// ── completionProbability ─────────────────────────────────────────────────────

describe("calculateCompletionProbability", () => {
  it("treats Successful / Claimed as 1 and Failed as 0", () => {
    expect(calculateCompletionProbability(makeCampaign({ status: "Successful" }), 0)).toBe(1);
    expect(calculateCompletionProbability(makeCampaign({ status: "Claimed" }), 0)).toBe(1);
    expect(calculateCompletionProbability(makeCampaign({ status: "Failed" }), 0)).toBe(0);
  });

  it("returns 1 once the success goal has been reached", () => {
    const campaign = makeCampaign({ totalRaised: "60000", minTarget: "50000" });
    expect(calculateCompletionProbability(campaign, 100)).toBe(1);
  });

  it("returns 0 for an expired campaign below its goal", () => {
    const campaign = makeCampaign({ deadline: 100, totalRaised: "1000" });
    expect(calculateCompletionProbability(campaign, 200)).toBe(0);
  });

  it("returns 1 for an expired campaign that already met its goal", () => {
    const campaign = makeCampaign({ deadline: 100, totalRaised: "60000" });
    expect(calculateCompletionProbability(campaign, 200)).toBe(1);
  });

  it("uses a neutral prior for a freshly launched campaign", () => {
    const campaign = makeCampaign({
      createdAt: 500,
      deadline: 900,
      totalRaised: "1000",
      minTarget: "50000",
    });
    expect(calculateCompletionProbability(campaign, 500)).toBe(NEUTRAL_COMPLETION_PRIOR);
  });

  it("is robust to non-finite timing fields", () => {
    const campaign = makeCampaign({ deadline: Number.NaN });
    expect(calculateCompletionProbability(campaign, 100)).toBe(NEUTRAL_COMPLETION_PRIOR);
  });

  it("projects a linear funding pace against the goal", () => {
    const campaign = makeCampaign({
      minTarget: "8000",
      createdAt: 1000,
      deadline: 5000,
      totalRaised: "2000",
    });
    // elapsed 2000 s, pace 1 stroop/s → projected 4000 of goal 8000 → 0.5
    expect(calculateCompletionProbability(campaign, 3000)).toBeCloseTo(0.5, 5);
  });
});

// ── campaignProgress ──────────────────────────────────────────────────────────

describe("campaignProgress", () => {
  it("returns raised / success goal", () => {
    const campaign = makeCampaign({ totalRaised: "25000", minTarget: "50000" });
    expect(campaignProgress(campaign)).toBe(0.5);
  });

  it("clamps above-goal progress to 1", () => {
    const campaign = makeCampaign({ totalRaised: "60000", minTarget: "50000" });
    expect(campaignProgress(campaign)).toBe(1);
  });
});

// ── normalizeWeights ──────────────────────────────────────────────────────────

describe("normalizeWeights", () => {
  it("leaves defaults unchanged", () => {
    const w = normalizeWeights(DEFAULT_WEIGHTS);
    expect(w.velocity).toBeCloseTo(0.4, 5);
    expect(w.engagement).toBeCloseTo(0.3, 5);
    expect(w.completion).toBeCloseTo(0.3, 5);
  });

  it("renormalises a non-unit sum to 1", () => {
    const w = normalizeWeights({ velocity: 1, engagement: 1, completion: 2 });
    expect(w.velocity).toBeCloseTo(0.25, 5);
    expect(w.engagement).toBeCloseTo(0.25, 5);
    expect(w.completion).toBeCloseTo(0.5, 5);
  });

  it("clamps negatives and falls back to defaults when all are zero", () => {
    expect(normalizeWeights({ velocity: -5, engagement: 1, completion: 0 })).toEqual({
      velocity: 0,
      engagement: 1,
      completion: 0,
    });
    expect(normalizeWeights({ velocity: 0, engagement: 0, completion: 0 })).toEqual(
      DEFAULT_WEIGHTS
    );
  });
});

// ── weightsFromEnv ────────────────────────────────────────────────────────────

describe("weightsFromEnv", () => {
  it("reads and renormalises weights from environment values", () => {
    const w = weightsFromEnv({
      TRENDING_VELOCITY_WEIGHT: "2",
      TRENDING_ENGAGEMENT_WEIGHT: "1",
      TRENDING_COMPLETION_WEIGHT: "1",
    } as NodeJS.ProcessEnv);
    expect(w.velocity).toBeCloseTo(0.5, 5);
    expect(w.engagement).toBeCloseTo(0.25, 5);
    expect(w.completion).toBeCloseTo(0.25, 5);
  });

  it("falls back to defaults for invalid values", () => {
    const w = weightsFromEnv({
      TRENDING_VELOCITY_WEIGHT: "not-a-number",
      TRENDING_ENGAGEMENT_WEIGHT: "-1",
    } as NodeJS.ProcessEnv);
    expect(w.velocity).toBeCloseTo(DEFAULT_WEIGHTS.velocity, 5);
    expect(w.engagement).toBeCloseTo(DEFAULT_WEIGHTS.engagement, 5);
  });
});

// ── scoreTrendingCampaigns ────────────────────────────────────────────────────

describe("scoreTrendingCampaigns", () => {
  const NOW = 5_000_000;

  it("scores a single campaign at 100 with full component scores", () => {
    const [res] = scoreTrendingCampaigns([makeCampaign()], DEFAULT_WEIGHTS, NOW);
    expect(res.score).toBe(100);
    expect(res.rank).toBe(1);
    expect(res.components.velocity).toBe(1);
    expect(res.components.engagement).toBe(1);
    expect(res.components.completion).toBe(1);
  });

  it("returns an empty list for an empty input", () => {
    expect(scoreTrendingCampaigns([], DEFAULT_WEIGHTS, NOW)).toEqual([]);
  });

  it("ranks a strong campaign above a weak one", () => {
    const strong = makeCampaign({
      id: "strong",
      uniqueContributors: 40,
      contributionCount: 40,
      totalRaised: "60000",
      minTarget: "50000",
      createdAt: NOW - 200_000,
      deadline: NOW + 200_000,
      contributions: [
        { contributor: "GAAA", amount: "8000", timestamp: NOW - 1000 },
        { contributor: "GBBB", amount: "7000", timestamp: NOW - 2000 },
        { contributor: "GCCC", amount: "5000", timestamp: NOW - 3000 },
      ],
    });
    const weak = makeCampaign({
      id: "weak",
      uniqueContributors: 1,
      contributionCount: 30,
      contributions: [],
      createdAt: NOW - 200_000,
      deadline: NOW + 1000,
      totalRaised: "100",
      minTarget: "50000",
    });

    const ranked = scoreTrendingCampaigns([weak, strong], DEFAULT_WEIGHTS, NOW);
    expect(ranked[0].id).toBe("strong");
    expect(ranked[1].id).toBe("weak");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[0].raw.dailyVelocity).toBeGreaterThan(0);
    expect(ranked[1].raw.dailyVelocity).toBe(0);
  });

  it("exposes the raw metrics on ranked results", () => {
    const weak = makeCampaign({ id: "weak", totalRaised: "100", minTarget: "50000" });
    const [res] = scoreTrendingCampaigns([weak], DEFAULT_WEIGHTS, NOW);
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
    expect(res.raw.engagementRate).toBe(0);
    expect(res.raw.completionProbability).toBeGreaterThanOrEqual(0);
  });

  it("flips the ranking when engagement is weighted above velocity", () => {
    const fast = makeCampaign({
      id: "fast",
      uniqueContributors: 1,
      contributionCount: 30,
      totalRaised: "60000",
      minTarget: "50000",
      createdAt: NOW - TEN,
      deadline: NOW + TEN,
      contributions: [
        { contributor: "GFAST", amount: "15000", timestamp: NOW - 1000 },
      ],
    });
    const broad = makeCampaign({
      id: "broad",
      uniqueContributors: 30,
      contributionCount: 30,
      contributions: [],
      totalRaised: "60000",
      minTarget: "50000",
      createdAt: NOW - TEN,
      deadline: NOW + TEN,
    });

    // `fast` wins on velocity, `broad` wins on engagement; completion is equal.
    const defaultRanked = scoreTrendingCampaigns([fast, broad], DEFAULT_WEIGHTS, NOW);
    expect(defaultRanked[0].id).toBe("fast");

    const engagementHeavy = scoreTrendingCampaigns(
      [fast, broad],
      { velocity: 0.1, engagement: 1, completion: 0.1 },
      NOW
    );
    expect(engagementHeavy[0].id).toBe("broad");
  });
});

// ── CampaignTrendingService ───────────────────────────────────────────────────

describe("CampaignTrendingService", () => {
  const active = makeCampaign({ id: "a", status: "Active" });
  const failed = makeCampaign({ id: "f", status: "Failed" });
  const successful = makeCampaign({ id: "s", status: "Successful" });

  it("returns only Active campaigns by default", async () => {
    const svc = new CampaignTrendingService({
      dataSource: withCampaigns([active, failed, successful]),
    });
    const res = await svc.getTrendingCampaigns();
    expect(res.meta.evaluated).toBe(3);
    expect(res.meta.total).toBe(1);
    expect(res.data.map((c) => c.id)).toEqual(["a"]);
  });

  it("includes non-active campaigns when requested", async () => {
    const svc = new CampaignTrendingService({
      dataSource: withCampaigns([active, failed, successful]),
    });
    const res = await svc.getTrendingCampaigns({ includeNonActive: true });
    expect(res.meta.total).toBe(3);
  });

  it("paginates ranked results", async () => {
    const campaigns = [1, 2, 3].map((n) =>
      makeCampaign({ id: String(n), status: "Active" })
    );
    const svc = new CampaignTrendingService({ dataSource: withCampaigns(campaigns) });
    const first = await svc.getTrendingCampaigns({ limit: 2 });
    const rest = await svc.getTrendingCampaigns({ limit: 2, offset: 2 });
    expect(first.data).toHaveLength(2);
    expect(rest.data).toHaveLength(1);
    expect(first.meta.total).toBe(3);
  });

  it("honours constructor weight overrides", async () => {
    const svc = new CampaignTrendingService({
      dataSource: withCampaigns([active]),
      weights: { velocity: 1, engagement: 0, completion: 0 },
    });
    const res = await svc.getTrendingCampaigns();
    expect(res.meta.weights.velocity).toBe(1);
    expect(res.meta.weights.engagement).toBe(0);
  });

  it("exposes the raw campaign list", async () => {
    const svc = new CampaignTrendingService({ dataSource: withCampaigns([active]) });
    const campaigns = await svc.getCampaigns("testnet");
    expect(campaigns).toHaveLength(1);
  });
});



