import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import {
  CampaignImpactLeaderboardService,
  IMPACT_LEADERBOARD_CATEGORIES,
  setCampaignImpactLeaderboardService,
  type CampaignImpactDataSource,
  type CampaignImpactRecord,
} from "@/services/campaign-impact-leaderboard.service";

const DAY = 86_400;

const CAMPAIGNS: CampaignImpactRecord[] = [
  {
    id: "1",
    title: "Mangrove Belt Restoration",
    creator: "GMANGROVE",
    status: "Successful",
    createdAt: 0,
    completedAt: 5 * DAY,
    targetAmount: "1000",
    totalRaised: "1200",
    sponsorCount: 40,
    species: [
      { speciesId: "teak", trees: 300 },
      { speciesId: "oak", trees: 100 },
    ],
  },
  {
    id: "2",
    title: "Community Orchard Diversity Pilot",
    creator: "GORCHARD",
    status: "Active",
    createdAt: 0,
    completedAt: null,
    targetAmount: "1000",
    totalRaised: "200",
    sponsorCount: 90,
    species: [
      { speciesId: "mango", trees: 50 },
      { speciesId: "oak", trees: 40 },
      { speciesId: "pine", trees: 30 },
      { speciesId: "neem", trees: 20 },
    ],
  },
  {
    id: "3",
    title: "Sahel Fast-Growth Shelterbelt",
    creator: "GSAHEL",
    status: "Successful",
    createdAt: 0,
    completedAt: 2 * DAY,
    targetAmount: "1000",
    totalRaised: "1500",
    sponsorCount: 25,
    species: [{ speciesId: "eucalyptus", trees: 120 }],
  },
];

function request(search = ""): NextRequest {
  return new NextRequest(`http://localhost/api/campaigns/impact-leaderboard${search}`);
}

function fixtureDataSource(networks: string[] = []): CampaignImpactDataSource {
  return {
    getCampaigns: async (network?: string) => {
      networks.push(network ?? "unset");
      return CAMPAIGNS;
    },
  };
}

beforeEach(() => {
  setCampaignImpactLeaderboardService(
    new CampaignImpactLeaderboardService({ dataSource: fixtureDataSource() }),
  );
});

afterEach(() => {
  setCampaignImpactLeaderboardService(null);
});

describe("GET /api/campaigns/impact-leaderboard", () => {
  it("returns every impact board with ranks starting at 1", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    for (const category of IMPACT_LEADERBOARD_CATEGORIES) {
      const board = body.data[category];
      expect(board.length).toBeGreaterThan(0);
      expect(board.map((entry: { rank: number }) => entry.rank)).toEqual(
        board.map((_: unknown, index: number) => index + 1),
      );
    }
  });

  it("ranks the trees board by total trees and the species board by diversity", async () => {
    const body = await (await GET(request())).json();

    expect(body.data.trees[0]).toMatchObject({ rank: 1, campaignId: "1", value: 400 });
    expect(body.data.species[0]).toMatchObject({ campaignId: "2", value: 4 });
  });

  it("ranks the fastest board ascending and excludes the unfinished campaign", async () => {
    const body = await (await GET(request())).json();

    expect(body.data.fastest.map((entry: { campaignId: string }) => entry.campaignId)).toEqual([
      "3",
      "1",
    ]);
    expect(body.data.fastest.map((entry: { value: number }) => entry.value)).toEqual([
      2 * DAY,
      5 * DAY,
    ]);
  });

  it("publishes the units and pre-slice totals for each board", async () => {
    const body = await (await GET(request())).json();

    expect(body.meta.units.co2).toBe("kgCO2e/year");
    expect(body.meta.units.fastest).toBe("seconds");
    expect(body.meta.evaluated).toBe(3);
    expect(body.meta.totals.fastest).toBe(2);
    expect(body.meta.totals.trees).toBe(3);
  });

  it("honours the limit query parameter per board", async () => {
    const response = await GET(request("?limit=1"));
    const body = await response.json();

    expect(body.meta.limit).toBe(1);
    for (const category of IMPACT_LEADERBOARD_CATEGORIES) {
      expect(body.data[category]).toHaveLength(1);
    }
    // Totals still describe the full candidate set, not the page.
    expect(body.meta.totals.trees).toBe(3);
  });

  it("passes the requested network to the data source and echoes it back", async () => {
    const networks: string[] = [];
    setCampaignImpactLeaderboardService(
      new CampaignImpactLeaderboardService({ dataSource: fixtureDataSource(networks) }),
    );

    const body = await (await GET(request("?network=mainnet"))).json();

    expect(networks).toContain("mainnet");
    expect(body.meta.network).toBe("mainnet");
  });

  it("defaults to testnet", async () => {
    const body = await (await GET(request())).json();

    expect(body.meta.network).toBe("testnet");
  });

  it("rejects an unknown network", async () => {
    const response = await GET(request("?network=devnet"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid query parameters");
  });

  it("rejects a limit above the maximum", async () => {
    const response = await GET(request("?limit=500"));

    expect(response.status).toBe(400);
  });

  it("rejects a non-numeric limit", async () => {
    const response = await GET(request("?limit=lots"));

    expect(response.status).toBe(400);
  });

  it("returns 500 with the failure message when the data source throws", async () => {
    setCampaignImpactLeaderboardService(
      new CampaignImpactLeaderboardService({
        dataSource: {
          getCampaigns: async () => {
            throw new Error("indexer unavailable");
          },
        },
      }),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("indexer unavailable");
  });
});
