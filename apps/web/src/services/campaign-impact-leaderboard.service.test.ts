// @vitest-environment node
import { describe, it, expect } from "vitest";
import { TREE_SPECIES, getTreeSpecies } from "@/lib/co2-impact";
import {
  DEFAULT_IMPACT_LIMIT,
  IMPACT_LEADERBOARD_CATEGORIES,
  IMPACT_LEADERBOARD_UNITS,
  MAX_IMPACT_LIMIT,
  CampaignImpactLeaderboardService,
  DefaultImpactCampaignDataSource,
  campaignCo2PerYearKg,
  campaignCompletionSeconds,
  campaignFundingProgress,
  campaignSpeciesCount,
  campaignTreeCount,
  computeCampaignImpactMetrics,
  demoImpactCampaigns,
  impactMetricValue,
  normalizeSpeciesPlanting,
  rankImpactCampaigns,
  type CampaignImpactDataSource,
  type CampaignImpactRecord,
} from "./campaign-impact-leaderboard.service";

const DAY = 86_400;

function makeCampaign(overrides: Partial<CampaignImpactRecord> = {}): CampaignImpactRecord {
  return {
    id: "1",
    title: "Test campaign",
    creator: "GCREATOR",
    status: "Active",
    createdAt: 1_000_000,
    completedAt: null,
    targetAmount: "10000",
    totalRaised: "5000",
    sponsorCount: 10,
    species: [{ speciesId: "oak", trees: 100 }],
    ...overrides,
  };
}

/** Inline data source backed by a fixture list. */
function withCampaigns(campaigns: CampaignImpactRecord[]): CampaignImpactDataSource {
  return { getCampaigns: async () => campaigns };
}

// ── normalizeSpeciesPlanting ──────────────────────────────────────────────────

describe("normalizeSpeciesPlanting", () => {
  it("deduplicates species and sums their tree counts", () => {
    const record = makeCampaign({
      species: [
        { speciesId: "oak", trees: 10 },
        { speciesId: "teak", trees: 5 },
        { speciesId: "oak", trees: 7 },
      ],
    });

    expect(normalizeSpeciesPlanting(record)).toEqual([
      { speciesId: "oak", trees: 17 },
      { speciesId: "teak", trees: 5 },
    ]);
  });

  it("floors fractional counts and drops non-positive or unnamed entries", () => {
    const record = makeCampaign({
      species: [
        { speciesId: "oak", trees: 10.9 },
        { speciesId: "teak", trees: 0 },
        { speciesId: "pine", trees: -4 },
        { speciesId: "", trees: 8 },
      ],
    });

    expect(normalizeSpeciesPlanting(record)).toEqual([{ speciesId: "oak", trees: 10 }]);
  });

  it("returns an empty breakdown when the campaign has no planting data", () => {
    expect(normalizeSpeciesPlanting({ species: undefined as never })).toEqual([]);
  });
});

// ── Derived metrics ───────────────────────────────────────────────────────────

describe("campaignTreeCount", () => {
  it("sums trees across every species", () => {
    const record = makeCampaign({
      species: [
        { speciesId: "oak", trees: 40 },
        { speciesId: "teak", trees: 60 },
      ],
    });

    expect(campaignTreeCount(record)).toBe(100);
  });

  it("is 0 for a campaign with no plantings", () => {
    expect(campaignTreeCount(makeCampaign({ species: [] }))).toBe(0);
  });
});

describe("campaignCo2PerYearKg", () => {
  it("uses the base annual rate of each species", () => {
    const record = makeCampaign({
      species: [
        { speciesId: "teak", trees: 10 },
        { speciesId: "oak", trees: 20 },
      ],
    });

    const expected =
      10 * getTreeSpecies("teak").co2PerTreePerYearKg + 20 * getTreeSpecies("oak").co2PerTreePerYearKg;

    expect(campaignCo2PerYearKg(record)).toBe(expected);
  });

  it("falls back to the default species rate for an unknown id", () => {
    const record = makeCampaign({ species: [{ speciesId: "unobtainium", trees: 10 }] });

    expect(campaignCo2PerYearKg(record)).toBe(10 * TREE_SPECIES[0].co2PerTreePerYearKg);
  });

  it("does not apply the rainy-season 2x projection bonus", () => {
    // June is inside the May–October rainy-season window used by
    // calculateCo2Offset; the leaderboard must stay date-independent, so the
    // value is the plain base-rate product.
    const record = makeCampaign({
      createdAt: Date.UTC(2026, 5, 15) / 1000,
      species: [{ speciesId: "mango", trees: 100 }],
    });

    expect(campaignCo2PerYearKg(record)).toBe(100 * getTreeSpecies("mango").co2PerTreePerYearKg);
  });
});

describe("campaignSpeciesCount", () => {
  it("counts distinct species, not plantings", () => {
    const record = makeCampaign({
      species: [
        { speciesId: "oak", trees: 10 },
        { speciesId: "oak", trees: 10 },
        { speciesId: "pine", trees: 10 },
      ],
    });

    expect(campaignSpeciesCount(record)).toBe(2);
  });
});

describe("campaignCompletionSeconds", () => {
  it("measures the gap between creation and completion", () => {
    const record = makeCampaign({ createdAt: 1_000, completedAt: 1_000 + 5 * DAY });

    expect(campaignCompletionSeconds(record)).toBe(5 * DAY);
  });

  it("returns 0 for a campaign that completed in the same second", () => {
    expect(campaignCompletionSeconds(makeCampaign({ createdAt: 500, completedAt: 500 }))).toBe(0);
  });

  it("returns null for campaigns that have not completed", () => {
    expect(campaignCompletionSeconds(makeCampaign({ completedAt: null }))).toBeNull();
  });

  it("returns null for an impossible completion time", () => {
    expect(campaignCompletionSeconds(makeCampaign({ createdAt: 900, completedAt: 800 }))).toBeNull();
  });
});

describe("campaignFundingProgress", () => {
  it("returns the raised/target ratio", () => {
    expect(
      campaignFundingProgress(makeCampaign({ targetAmount: "1000", totalRaised: "250" })),
    ).toBe(0.25);
  });

  it("clamps oversubscribed campaigns to 1", () => {
    expect(
      campaignFundingProgress(makeCampaign({ targetAmount: "1000", totalRaised: "4000" })),
    ).toBe(1);
  });

  it("returns 0 when the target is missing or invalid", () => {
    expect(campaignFundingProgress(makeCampaign({ targetAmount: "0", totalRaised: "50" }))).toBe(0);
    expect(campaignFundingProgress(makeCampaign({ targetAmount: "n/a", totalRaised: "50" }))).toBe(0);
  });
});

describe("computeCampaignImpactMetrics", () => {
  it("derives every board metric from one record", () => {
    const record = makeCampaign({
      createdAt: 1_000,
      completedAt: 1_000 + 2 * DAY,
      sponsorCount: 7,
      targetAmount: "1000",
      totalRaised: "500",
      species: [
        { speciesId: "teak", trees: 3 },
        { speciesId: "oak", trees: 2 },
      ],
    });

    expect(computeCampaignImpactMetrics(record)).toEqual({
      trees: 5,
      co2PerYearKg: 3 * getTreeSpecies("teak").co2PerTreePerYearKg + 2 * getTreeSpecies("oak").co2PerTreePerYearKg,
      co2PerYearTonnes: (3 * getTreeSpecies("teak").co2PerTreePerYearKg + 2 * getTreeSpecies("oak").co2PerTreePerYearKg) / 1000,
      sponsors: 7,
      speciesCount: 2,
      species: [
        { speciesId: "teak", trees: 3 },
        { speciesId: "oak", trees: 2 },
      ],
      progress: 0.5,
      completionSeconds: 2 * DAY,
      completedAt: 1_000 + 2 * DAY,
    });
  });

  it("never reports a negative sponsor count", () => {
    expect(computeCampaignImpactMetrics(makeCampaign({ sponsorCount: -3 })).sponsors).toBe(0);
  });
});

describe("impactMetricValue", () => {
  it("maps each board to its metric and returns null for unfinished campaigns on 'fastest'", () => {
    const metrics = computeCampaignImpactMetrics(
      makeCampaign({
        createdAt: 0,
        completedAt: 60,
        sponsorCount: 4,
        species: [
          { speciesId: "oak", trees: 10 },
          { speciesId: "pine", trees: 5 },
        ],
      }),
    );

    expect(impactMetricValue(metrics, "trees")).toBe(15);
    expect(impactMetricValue(metrics, "sponsors")).toBe(4);
    expect(impactMetricValue(metrics, "species")).toBe(2);
    expect(impactMetricValue(metrics, "fastest")).toBe(60);
    expect(impactMetricValue(metrics, "co2")).toBeGreaterThan(0);

    const unfinished = computeCampaignImpactMetrics(makeCampaign({ completedAt: null }));
    expect(impactMetricValue(unfinished, "fastest")).toBeNull();
  });
});

// ── Ranking ───────────────────────────────────────────────────────────────────

describe("rankImpactCampaigns", () => {
  it("ranks the trees board in descending order and assigns 1-based ranks", () => {
    const ranked = rankImpactCampaigns(
      [
        makeCampaign({ id: "a", species: [{ speciesId: "oak", trees: 10 }] }),
        makeCampaign({ id: "b", species: [{ speciesId: "oak", trees: 30 }] }),
        makeCampaign({ id: "c", species: [{ speciesId: "oak", trees: 20 }] }),
      ],
      "trees",
    );

    expect(ranked.map((entry) => [entry.rank, entry.campaignId, entry.value])).toEqual([
      [1, "b", 30],
      [2, "c", 20],
      [3, "a", 10],
    ]);
  });

  it("ranks the co2 board by projected uptake, not by tree count", () => {
    const ranked = rankImpactCampaigns(
      [
        makeCampaign({ id: "oaks", species: [{ speciesId: "oak", trees: 60 }] }), // 1260 kg/yr
        makeCampaign({ id: "eucalyptus", species: [{ speciesId: "eucalyptus", trees: 40 }] }), // 1360 kg/yr
      ],
      "co2",
    );

    expect(ranked.map((entry) => entry.campaignId)).toEqual(["eucalyptus", "oaks"]);
    expect(ranked[0].value).toBeGreaterThan(ranked[1].value);
  });

  it("ranks the species board by diversity, regardless of volume", () => {
    const ranked = rankImpactCampaigns(
      [
        makeCampaign({ id: "mono", species: [{ speciesId: "oak", trees: 5_000 }] }),
        makeCampaign({
          id: "mixed",
          species: [
            { speciesId: "oak", trees: 3 },
            { speciesId: "pine", trees: 3 },
            { speciesId: "teak", trees: 3 },
          ],
        }),
      ],
      "species",
    );

    expect(ranked.map((entry) => entry.campaignId)).toEqual(["mixed", "mono"]);
    expect(ranked[0].value).toBe(3);
  });

  it("ranks the sponsors board by distinct sponsor count", () => {
    const ranked = rankImpactCampaigns(
      [
        makeCampaign({ id: "few", sponsorCount: 3 }),
        makeCampaign({ id: "many", sponsorCount: 250 }),
      ],
      "sponsors",
    );

    expect(ranked.map((entry) => entry.campaignId)).toEqual(["many", "few"]);
  });

  it("ranks the fastest board ascending and only includes completed campaigns", () => {
    const ranked = rankImpactCampaigns(
      [
        makeCampaign({ id: "slow", createdAt: 0, completedAt: 10 * DAY }),
        makeCampaign({ id: "quick", createdAt: 0, completedAt: 2 * DAY }),
        makeCampaign({ id: "ongoing", completedAt: null }),
      ],
      "fastest",
    );

    expect(ranked.map((entry) => [entry.campaignId, entry.value])).toEqual([
      ["quick", 2 * DAY],
      ["slow", 10 * DAY],
    ]);
  });

  it("keeps a same-second completion on the fastest board", () => {
    const ranked = rankImpactCampaigns(
      [makeCampaign({ id: "instant", createdAt: 42, completedAt: 42 })],
      "fastest",
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0].value).toBe(0);
  });

  it("drops campaigns with no impact from the volume boards", () => {
    const ranked = rankImpactCampaigns(
      [
        makeCampaign({ id: "empty", species: [], sponsorCount: 0 }),
        makeCampaign({ id: "real", species: [{ speciesId: "oak", trees: 1 }], sponsorCount: 1 }),
      ],
      "trees",
    );

    expect(ranked.map((entry) => entry.campaignId)).toEqual(["real"]);
  });

  it("breaks ties deterministically by trees, then CO2, then campaign id", () => {
    const campaigns = [
      makeCampaign({ id: "c", sponsorCount: 5, species: [{ speciesId: "oak", trees: 10 }] }),
      makeCampaign({ id: "a", sponsorCount: 5, species: [{ speciesId: "teak", trees: 10 }] }),
      makeCampaign({ id: "b", sponsorCount: 5, species: [{ speciesId: "oak", trees: 20 }] }),
    ];

    const first = rankImpactCampaigns(campaigns, "sponsors").map((entry) => entry.campaignId);
    const second = rankImpactCampaigns(campaigns, "sponsors").map((entry) => entry.campaignId);

    // Equal sponsors → more trees first ("b"), then higher CO2 per tree ("a",
    // teak at 24 kg/yr, beats "c", oak at 21 kg/yr).
    expect(first).toEqual(["b", "a", "c"]);
    expect(second).toEqual(first);
  });

  it("applies the limit and returns an empty board for a zero limit", () => {
    const campaigns = [
      makeCampaign({ id: "1", species: [{ speciesId: "oak", trees: 30 }] }),
      makeCampaign({ id: "2", species: [{ speciesId: "oak", trees: 20 }] }),
      makeCampaign({ id: "3", species: [{ speciesId: "oak", trees: 10 }] }),
    ];

    expect(rankImpactCampaigns(campaigns, "trees", 2).map((entry) => entry.campaignId)).toEqual([
      "1",
      "2",
    ]);
    expect(rankImpactCampaigns(campaigns, "trees", 0)).toEqual([]);
  });

  it("returns an empty board for an empty campaign list", () => {
    for (const category of IMPACT_LEADERBOARD_CATEGORIES) {
      expect(rankImpactCampaigns([], category)).toEqual([]);
    }
  });

  it("exposes the derived metrics alongside each ranked entry", () => {
    const [entry] = rankImpactCampaigns(
      [makeCampaign({ id: "x", sponsorCount: 2, species: [{ speciesId: "oak", trees: 4 }] })],
      "trees",
    );

    expect(entry).toMatchObject({
      rank: 1,
      campaignId: "x",
      title: "Test campaign",
      creator: "GCREATOR",
      status: "Active",
      value: 4,
      metrics: { trees: 4, sponsors: 2, speciesCount: 1 },
    });
  });
});

// ── Service ───────────────────────────────────────────────────────────────────

describe("CampaignImpactLeaderboardService", () => {
  it("returns all five boards ranked from 1", async () => {
    const service = new CampaignImpactLeaderboardService({
      dataSource: withCampaigns(demoImpactCampaigns()),
    });

    const response = await service.getLeaderboard();

    expect(Object.keys(response.data).sort()).toEqual([...IMPACT_LEADERBOARD_CATEGORIES].sort());
    for (const category of IMPACT_LEADERBOARD_CATEGORIES) {
      const board = response.data[category];
      expect(board.length).toBeGreaterThan(0);
      expect(board.map((entry) => entry.rank)).toEqual(board.map((_, index) => index + 1));
    }
    expect(response.meta.evaluated).toBe(5);
    expect(response.meta.limit).toBe(DEFAULT_IMPACT_LIMIT);
    expect(response.meta.network).toBe("testnet");
    expect(response.meta.units).toEqual(IMPACT_LEADERBOARD_UNITS);
  });

  it("classifies the demo set consistently across boards", async () => {
    const service = new CampaignImpactLeaderboardService({
      dataSource: withCampaigns(demoImpactCampaigns()),
    });

    const { data, meta } = await service.getLeaderboard();

    // The 8-species diversity pilot wins the species board despite a smaller volume…
    expect(data.species[0].campaignId).toBe("4");
    expect(data.species[0].value).toBe(8);
    // …while the largest planting leads the trees board.
    expect(data.trees[0].campaignId).toBe("1");
    expect(data.sponsors[0].campaignId).toBe("4");
    // 'fastest' excludes the Active and Failed campaigns.
    expect(meta.totals.fastest).toBe(3);
    expect(data.fastest.map((entry) => entry.status)).toEqual([
      "Successful",
      "Successful",
      "Successful",
    ]);
    // The failed campaign planted 120 trees, so it appears — but last.
    expect(data.trees.at(-1)?.campaignId).toBe("5");
    expect(data.sponsors.at(-1)?.campaignId).toBe("5");
  });

  it("honours limit, network and clamps out-of-range limits", async () => {
    const requested: string[] = [];
    const service = new CampaignImpactLeaderboardService({
      dataSource: {
        getCampaigns: async (network?: string) => {
          requested.push(network ?? "unset");
          return demoImpactCampaigns();
        },
      },
    });

    const limited = await service.getLeaderboard({ limit: 2, network: "mainnet" });
    expect(limited.data.trees).toHaveLength(2);
    expect(limited.meta.limit).toBe(2);
    expect(limited.meta.network).toBe("mainnet");
    expect(limited.meta.totals.trees).toBeGreaterThan(2);

    expect((await service.getLeaderboard({ limit: MAX_IMPACT_LIMIT + 100 })).meta.limit).toBe(
      MAX_IMPACT_LIMIT,
    );
    expect((await service.getLeaderboard({ limit: 0 })).meta.limit).toBe(1);
    expect((await service.getLeaderboard({ limit: Number.NaN })).meta.limit).toBe(
      DEFAULT_IMPACT_LIMIT,
    );
    expect(requested).toContain("mainnet");
  });

  it("returns empty boards when the data source has no campaigns", async () => {
    const service = new CampaignImpactLeaderboardService({ dataSource: withCampaigns([]) });

    const response = await service.getLeaderboard();

    expect(response.meta.evaluated).toBe(0);
    for (const category of IMPACT_LEADERBOARD_CATEGORIES) {
      expect(response.data[category]).toEqual([]);
      expect(response.meta.totals[category]).toBe(0);
    }
  });

  it("stamps generatedAt in unix seconds", async () => {
    const service = new CampaignImpactLeaderboardService({ dataSource: withCampaigns([]) });

    const { meta } = await service.getLeaderboard();
    const nowSeconds = Math.floor(Date.now() / 1000);

    expect(Math.abs(meta.generatedAt - nowSeconds)).toBeLessThanOrEqual(5);
  });
});

describe("DefaultImpactCampaignDataSource", () => {
  it("serves no live campaigns under test so the endpoint stays deterministic", async () => {
    await expect(new DefaultImpactCampaignDataSource().getCampaigns("testnet")).resolves.toEqual([]);
  });
});

describe("demoImpactCampaigns", () => {
  it("returns a stable fixture set covering each lifecycle state", () => {
    const campaigns = demoImpactCampaigns();

    expect(campaigns).toHaveLength(5);
    expect(new Set(campaigns.map((campaign) => campaign.id)).size).toBe(5);
    expect(campaigns.map((campaign) => campaign.status)).toContain("Active");
    expect(campaigns.map((campaign) => campaign.status)).toContain("Failed");
    expect(campaigns.filter((campaign) => campaign.completedAt !== null)).toHaveLength(3);
  });
});
