import { describe, expect, it } from "vitest";
import {
  CampaignComparisonError,
  CampaignComparisonService,
  DefaultComparisonCampaignDataSource,
  MAX_COMPARED_CAMPAIGNS,
  buildComparisonColumn,
  compareCampaigns,
  comparisonLeaders,
  parseComparisonIds,
  type ComparisonCampaignRecord,
} from "./campaign-comparison.service";

function record(overrides: Partial<ComparisonCampaignRecord> = {}): ComparisonCampaignRecord {
  return {
    id: "1",
    title: "Mangrove Belt Restoration",
    creator: "GMANGROVE",
    status: "Active",
    createdAt: 0,
    completedAt: null,
    // 1,000 XLM target, 500 XLM raised.
    targetAmount: "10000000000",
    totalRaised: "5000000000",
    sponsorCount: 40,
    species: [
      { speciesId: "oak", trees: 100 },
      { speciesId: "teak", trees: 300 },
    ],
    location: { country: "Kenya", region: "Lamu" },
    ...overrides,
  };
}

const CAMPAIGNS: ComparisonCampaignRecord[] = [
  record(),
  record({
    id: "2",
    title: "Highland Pine Corridor",
    totalRaised: "10000000000",
    sponsorCount: 90,
    species: [{ speciesId: "pine", trees: 2000 }],
    location: { country: "Ethiopia", region: "Amhara" },
  }),
  record({
    id: "3",
    title: "Sahel Shelterbelt",
    totalRaised: "0",
    sponsorCount: 0,
    species: [],
    location: { country: "Niger", region: "Tillabéri" },
  }),
];

describe("parseComparisonIds", () => {
  it("returns no ids for a missing value", () => {
    expect(parseComparisonIds(null)).toEqual([]);
    expect(parseComparisonIds(undefined)).toEqual([]);
    expect(parseComparisonIds("")).toEqual([]);
  });

  it("trims, drops empties, and deduplicates in order", () => {
    expect(parseComparisonIds(" 2, 1,,2 ,")).toEqual(["2", "1"]);
  });

  it(`rejects more than ${MAX_COMPARED_CAMPAIGNS} campaigns`, () => {
    expect(() => parseComparisonIds("1,2,3,4")).toThrow(CampaignComparisonError);
  });

  it("allows repeated ids that dedupe down to the limit", () => {
    expect(parseComparisonIds("1,2,3,3,1")).toEqual(["1", "2", "3"]);
  });

  it("rejects an id that cannot be a campaign id", () => {
    expect(() => parseComparisonIds("1,<script>")).toThrow('"<script>" is not a valid campaign id');
  });
});

describe("buildComparisonColumn", () => {
  it("derives species, location, completion, CO2, sponsors, and cost per tree", () => {
    const column = buildComparisonColumn(record());

    expect(column).toEqual({
      campaignId: "1",
      title: "Mangrove Belt Restoration",
      status: "Active",
      location: { country: "Kenya", region: "Lamu", label: "Lamu, Kenya" },
      species: [
        { id: "teak", label: "Teak", trees: 300, share: 0.75 },
        { id: "oak", label: "Oak", trees: 100, share: 0.25 },
      ],
      trees: 400,
      completionRate: 0.5,
      // 300 teak * 24 kg + 100 oak * 21 kg
      co2: { perYearKg: 9300, perYearTonnes: 9.3, over10YearsTonnes: 93 },
      sponsorCount: 40,
      raisedXlm: 500,
      costPerTreeXlm: 1.25,
    });
  });

  it("has no cost per tree before a tree is planted", () => {
    const column = buildComparisonColumn(CAMPAIGNS[2]);

    expect(column.trees).toBe(0);
    expect(column.species).toEqual([]);
    expect(column.costPerTreeXlm).toBeNull();
  });

  it("caps completion at 100% when a campaign is overfunded", () => {
    expect(buildComparisonColumn(record({ totalRaised: "30000000000" })).completionRate).toBe(1);
  });
});

describe("comparisonLeaders", () => {
  const columns = CAMPAIGNS.map(buildComparisonColumn);

  it("picks the highest value for higher-is-better metrics", () => {
    expect(comparisonLeaders(columns, "sponsorCount")).toEqual(["2"]);
    expect(comparisonLeaders(columns, "co2")).toEqual(["2"]);
    expect(comparisonLeaders(columns, "completionRate")).toEqual(["2"]);
  });

  it("picks the lowest cost per tree and ignores campaigns without one", () => {
    // 1,000 XLM / 2,000 trees = 0.5 beats 500 XLM / 400 trees = 1.25.
    expect(comparisonLeaders(columns, "costPerTree")).toEqual(["2"]);
  });

  it("reports every campaign on a tie", () => {
    const tied = [record(), record({ id: "9" })].map(buildComparisonColumn);

    expect(comparisonLeaders(tied, "sponsorCount")).toEqual(["1", "9"]);
  });

  it("never lets a zero lead", () => {
    const empty = [CAMPAIGNS[2], record({ ...CAMPAIGNS[2], id: "8" })].map(buildComparisonColumn);

    expect(comparisonLeaders(empty, "sponsorCount")).toEqual([]);
    expect(comparisonLeaders(empty, "costPerTree")).toEqual([]);
  });

  it("has no leaders with a single campaign", () => {
    expect(comparisonLeaders(columns.slice(0, 1), "sponsorCount")).toEqual([]);
  });
});

describe("compareCampaigns", () => {
  it("keeps the requested order and reports unknown ids", () => {
    const result = compareCampaigns(CAMPAIGNS, ["2", "404", "1"]);

    expect(result.campaigns.map((column) => column.campaignId)).toEqual(["2", "1"]);
    expect(result.missing).toEqual(["404"]);
    expect(result.leaders.sponsorCount).toEqual(["2"]);
  });

  it(`never compares more than ${MAX_COMPARED_CAMPAIGNS} campaigns`, () => {
    const many = ["a", "b", "c", "d"].map((id) => record({ id }));

    expect(compareCampaigns(many, ["a", "b", "c", "d"]).campaigns).toHaveLength(3);
  });
});

describe("CampaignComparisonService", () => {
  const service = new CampaignComparisonService({
    dataSource: { getCampaigns: async () => CAMPAIGNS },
  });

  it("lists campaign options alphabetically with their location", async () => {
    await expect(service.listOptions()).resolves.toEqual([
      { campaignId: "2", title: "Highland Pine Corridor", status: "Active", location: "Amhara, Ethiopia" },
      { campaignId: "1", title: "Mangrove Belt Restoration", status: "Active", location: "Lamu, Kenya" },
      { campaignId: "3", title: "Sahel Shelterbelt", status: "Active", location: "Tillabéri, Niger" },
    ]);
  });

  it("compares campaigns from the data source", async () => {
    const result = await service.compare(["1", "2"]);

    expect(result.campaigns).toHaveLength(2);
  });

  it("serves no demo campaigns under test", async () => {
    await expect(new DefaultComparisonCampaignDataSource().getCampaigns()).resolves.toEqual([]);
  });
});
