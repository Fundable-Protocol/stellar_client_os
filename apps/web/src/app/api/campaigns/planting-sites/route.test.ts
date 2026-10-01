import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import {
  InMemoryCampaignDataSource,
  setCampaignDataSource,
  type CampaignDataSource,
  type CampaignRecord,
} from "@/services/campaign.service";

function buildCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "camp-101",
    creator: "creator-1",
    name: "Amazon RainForest Reserve",
    status: "ACTIVE",
    goalAmount: "50000",
    raisedAmount: "33850",
    sponsorCount: 6,
    treeCount: 1000,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    statusChangedAt: 1_700_000_000_000,
    sponsors: [],
    statusHistory: [],
    ...overrides,
  };
}

function request(search = ""): NextRequest {
  return new NextRequest(`http://localhost/api/campaigns/planting-sites${search}`);
}

let source: CampaignDataSource;

beforeEach(() => {
  source = new InMemoryCampaignDataSource();
  setCampaignDataSource(source);
});

afterEach(() => {
  setCampaignDataSource(new InMemoryCampaignDataSource());
});

describe("GET /api/campaigns/planting-sites", () => {
  it("returns active planting sites with tree counts, species and stats", async () => {
    await source.saveCampaign(
      buildCampaign({
        treeCount: 500,
        treeSpecies: "Mangrove, Oak",
        region: "South America",
        gpsLocations: [{ latitude: -3.4653, longitude: -62.2159 }],
      }),
    );
    await source.saveCampaign(
      buildCampaign({
        id: "camp-102",
        name: "Mangrove Coast",
        treeCount: 300,
        treeSpecies: "Mangrove",
        region: "Africa",
        gpsLocations: [{ latitude: 5.6, longitude: -0.2 }],
      }),
    );

    const response = await GET(request());
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.meta.count).toBe(2);
    expect(body.meta.statusFilter).toBe("ACTIVE");
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({
      campaignId: "camp-101",
      campaignName: "Amazon RainForest Reserve",
      latitude: -3.4653,
      longitude: -62.2159,
      treeCount: 500,
      species: ["Mangrove", "Oak"],
      status: "ACTIVE",
      region: "South America",
    });
    expect(body.stats).toMatchObject({
      totalSites: 2,
      totalCampaigns: 2,
      totalTrees: 800,
    });
    expect(body.stats.speciesCounts).toEqual([
      { species: "Mangrove", count: 800 },
      { species: "Oak", count: 500 },
    ]);
  });

  it("excludes campaigns without GPS coordinates and non-ACTIVE campaigns by default", async () => {
    await source.saveCampaign(buildCampaign({ gpsLocations: [] }));
    await source.saveCampaign(
      buildCampaign({
        id: "camp-draft",
        status: "DRAFT",
        gpsLocations: [{ latitude: 10, longitude: 10 }],
      }),
    );
    await source.saveCampaign(
      buildCampaign({
        id: "camp-gps",
        treeCount: 100,
        gpsLocations: [{ latitude: 45.5, longitude: -73.6 }],
      }),
    );

    const body = await (await GET(request())).json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].campaignId).toBe("camp-gps");
  });

  it("supports status=all to include every lifecycle stage", async () => {
    await source.saveCampaign(
      buildCampaign({ id: "draft", status: "DRAFT", gpsLocations: [{ latitude: 10, longitude: 10 }] }),
    );
    await source.saveCampaign(
      buildCampaign({ id: "active", gpsLocations: [{ latitude: 20, longitude: 20 }] }),
    );

    const body = await (await GET(request("?status=all"))).json();
    expect(body.data).toHaveLength(2);
    expect(body.meta.statusFilter).toBe("all");
  });

  it("distributes a campaign's total tree count across multiple GPS points", async () => {
    await source.saveCampaign(
      buildCampaign({
        treeCount: 1001,
        gpsLocations: [
          { latitude: 0, longitude: 0 },
          { latitude: 1, longitude: 1 },
          { latitude: 2, longitude: 2 },
        ],
      }),
    );

    const body = await (await GET(request())).json();
    const counts = body.data.map((site: { treeCount: number }) => site.treeCount);
    expect(counts).toEqual([334, 334, 333]);
    expect(body.stats.totalTrees).toBe(1001);
  });

  it("returns 500 with the failure message when the data source throws", async () => {
    setCampaignDataSource({
      getCampaigns: async () => {
        throw new Error("indexer unavailable");
      },
      saveCampaign: async () => {
        throw new Error("should not be called");
      },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("indexer unavailable");
  });
});