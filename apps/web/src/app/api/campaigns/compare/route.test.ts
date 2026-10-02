import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import {
  CampaignComparisonService,
  setCampaignComparisonService,
  type ComparisonCampaignRecord,
} from "@/services/campaign-comparison.service";

const CAMPAIGNS: ComparisonCampaignRecord[] = [
  {
    id: "1",
    title: "Mangrove Belt Restoration",
    creator: "GMANGROVE",
    status: "Successful",
    createdAt: 0,
    completedAt: 100,
    targetAmount: "10000000000",
    totalRaised: "12000000000",
    sponsorCount: 40,
    species: [{ speciesId: "teak", trees: 400 }],
    location: { country: "Kenya", region: "Lamu" },
  },
  {
    id: "2",
    title: "Highland Pine Corridor",
    creator: "GHIGHLAND",
    status: "Active",
    createdAt: 0,
    completedAt: null,
    targetAmount: "10000000000",
    totalRaised: "2000000000",
    sponsorCount: 90,
    species: [{ speciesId: "pine", trees: 1000 }],
    location: { country: "Ethiopia", region: "Amhara" },
  },
];

const get = (query = "") => GET(new NextRequest(`http://test/api/campaigns/compare${query}`));

beforeEach(() => {
  setCampaignComparisonService(
    new CampaignComparisonService({ dataSource: { getCampaigns: async () => CAMPAIGNS } }),
  );
});

afterEach(() => {
  setCampaignComparisonService(null);
});

describe("GET /api/campaigns/compare", () => {
  it("lists the campaigns a sponsor can pick when no ids are given", async () => {
    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.options.map((option: { campaignId: string }) => option.campaignId)).toEqual([
      "2",
      "1",
    ]);
    expect(body.meta).toEqual({ maxCampaigns: 3, network: "testnet" });
  });

  it("compares the requested campaigns side by side", async () => {
    const response = await get("?ids=1,2");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.campaigns).toHaveLength(2);
    expect(body.data.campaigns[0]).toMatchObject({
      campaignId: "1",
      location: { label: "Lamu, Kenya" },
      species: [{ id: "teak", label: "Teak", trees: 400, share: 1 }],
      completionRate: 1,
      co2: { perYearKg: 9600 },
      sponsorCount: 40,
      costPerTreeXlm: 3,
    });
    expect(body.data.leaders).toEqual({
      completionRate: ["1"],
      co2: ["2"],
      sponsorCount: ["2"],
      costPerTree: ["2"],
    });
    expect(body.data.missing).toEqual([]);
  });

  it("reports ids that match no campaign", async () => {
    const body = await (await get("?ids=1,77")).json();

    expect(body.data.missing).toEqual(["77"]);
  });

  it("returns 404 when no requested campaign exists", async () => {
    const response = await get("?ids=77");

    expect(response.status).toBe(404);
    expect((await response.json()).missing).toEqual(["77"]);
  });

  it("rejects more than three campaigns", async () => {
    const response = await get("?ids=1,2,3,4");

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("At most 3");
  });

  it("rejects an unknown network", async () => {
    expect((await get("?ids=1&network=devnet")).status).toBe(400);
  });

  it("returns 500 without leaking internals when the data source fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setCampaignComparisonService(
      new CampaignComparisonService({
        dataSource: {
          getCampaigns: async () => {
            throw new Error("indexer at 10.0.0.4 refused");
          },
        },
      }),
    );

    const response = await get("?ids=1");

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Failed to compare campaigns");
    errorSpy.mockRestore();
  });
});
