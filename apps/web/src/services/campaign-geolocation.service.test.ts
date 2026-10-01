import { describe, expect, it } from "vitest";
import type { CampaignRecord } from "./campaign.service";
import {
  CampaignGeolocationService,
  countSitesByRegion,
  countTreesBySpecies,
  distributeTreeCount,
  getActivePlantingSites,
  getCampaignPlantingSites,
  isValidGpsPoint,
  parseTreeSpecies,
  summarizePlantingSites,
  type PlantingSite,
} from "./campaign-geolocation.service";

function buildCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "camp-101",
    creator: "creator-1",
    name: "Save the Amazon RainForest Reserve",
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

describe("campaign geolocation service", () => {
  it("parses comma, semicolon and slash-separated species lists", () => {
    expect(parseTreeSpecies("Oak, Pine; Mangrove / Teak")).toEqual([
      "Oak",
      "Pine",
      "Mangrove",
      "Teak",
    ]);
    expect(parseTreeSpecies("Mangrove trees")).toEqual(["Mangrove"]);
    expect(parseTreeSpecies("  ")).toEqual([]);
    expect(parseTreeSpecies(undefined)).toEqual([]);
  });

  it("deduplicates repeated species regardless of case", () => {
    expect(parseTreeSpecies("Oak, OAK, oak trees")).toEqual(["Oak"]);
  });

  it("distributes tree counts evenly across sites with the largest remainder first", () => {
    expect(distributeTreeCount(1000, 3)).toEqual([334, 333, 333]);
    expect(distributeTreeCount(100, 1)).toEqual([100]);
    expect(distributeTreeCount(0, 2)).toEqual([0, 0]);
    expect(distributeTreeCount(-5, 2)).toEqual([0, 0]);
  });

  it("accepts only in-range finite coordinates", () => {
    expect(isValidGpsPoint({ latitude: -3.5, longitude: 40.2 })).toBe(true);
    expect(isValidGpsPoint({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidGpsPoint({ latitude: 0, longitude: -181 })).toBe(false);
    expect(isValidGpsPoint({ latitude: "nope", longitude: 0 })).toBe(false);
    expect(isValidGpsPoint(null)).toBe(false);
  });

  it("builds one site per stored GPS point with distributed tree counts", () => {
    const campaign = buildCampaign({
      gpsLocations: [
        { latitude: -3.4653, longitude: -62.2159 },
        { latitude: -2.5, longitude: -60.0 },
      ],
      treeSpecies: "Mangrove, Oak",
    });

    const sites = getCampaignPlantingSites([campaign]);
    expect(sites).toHaveLength(2);
    expect(sites[0].id).toBe("camp-101:site-0");
    expect(sites[0].campaignName).toBe("Save the Amazon RainForest Reserve");
    expect(sites[0].treeCount).toBe(500);
    expect(sites[1].treeCount).toBe(500);
    expect(sites[0].species).toEqual(["Mangrove", "Oak"]);
    expect(sites[0].status).toBe("ACTIVE");
  });

  it("skips campaigns with no stored GPS coordinates", () => {
    const noGps = buildCampaign({ gpsLocations: undefined });
    const badGps = buildCampaign({ gpsLocations: [{ latitude: 999, longitude: 0 }] });
    expect(getCampaignPlantingSites([noGps, badGps])).toEqual([]);
  });

  it("returns only ACTIVE campaigns for the global planting map", () => {
    const active = buildCampaign({
      gpsLocations: [{ latitude: 45.5, longitude: -73.6 }],
    });
    const draft = buildCampaign({
      id: "camp-draft",
      status: "DRAFT",
      gpsLocations: [{ latitude: 10, longitude: 10 }],
    });

    const sites = getActivePlantingSites([active, draft]);
    expect(sites).toHaveLength(1);
    expect(sites[0].campaignId).toBe("camp-101");
  });

  it("summarizes sites into tree totals, species and region counts", () => {
    const sites = getCampaignPlantingSites([
      buildCampaign({
        gpsLocations: [{ latitude: 45.5, longitude: -73.6 }],
        treeSpecies: "Oak, Pine",
        treeCount: 200,
        region: "North America",
      }),
      buildCampaign({
        id: "camp-102",
        name: "Mangrove Coast",
        treeSpecies: "Mangrove",
        treeCount: 300,
        region: "Africa",
        gpsLocations: [{ latitude: 5.6, longitude: -0.2 }],
      }),
    ]);

    const stats = summarizePlantingSites(sites);
    expect(stats.totalSites).toBe(2);
    expect(stats.totalCampaigns).toBe(2);
    expect(stats.totalTrees).toBe(500);
    expect(stats.speciesCounts).toEqual([
      { species: "Mangrove", count: 300 },
      { species: "Oak", count: 200 },
      { species: "Pine", count: 200 },
    ]);
    expect(stats.regions).toEqual([
      { region: "North America", count: 1 },
      { region: "Africa", count: 1 },
    ]);
  });

  it("groups unknown species and regions under clear labels", () => {
    const sites = getCampaignPlantingSites([
      buildCampaign({
        gpsLocations: [{ latitude: 45.5, longitude: -73.6 }],
        treeSpecies: "",
        treeCount: 120,
        region: "",
      }),
    ]);

    expect(countTreesBySpecies(sites)).toEqual([{ species: "Unknown", count: 120 }]);
    expect(countSitesByRegion(sites)).toEqual([{ region: "Unknown", count: 1 }]);
  });
});

describe("CampaignGeolocationService", () => {
  const sites: PlantingSite[] = [
    {
      id: 'site-1',
      campaignId: 853,
      latitude: 0.5,
      longitude: 32.5,
      region: 'East Africa',
      species: ['Acacia', 'Moringa'],
      treesPlanted: 1000,
      plantedAt: new Date('2026-03-01'),
      verificationStatus: 'verified',
    },
    {
      id: 'site-2',
      campaignId: 853,
      latitude: -3.2,
      longitude: -60.0,
      region: 'Amazon Basin',
      species: ['Cedar', 'Mahogany'],
      treesPlanted: 2500,
      plantedAt: new Date('2026-04-15'),
      verificationStatus: 'verified',
    },
  ];

  it('filters sites within geographic bounding box', () => {
    const eastAfricaSites = CampaignGeolocationService.getSitesInBounds(sites, 0.0, 1.0, 32.0, 33.0);
    expect(eastAfricaSites.length).toBe(1);
    expect(eastAfricaSites[0].id).toBe('site-1');
  });

  it('transforms planting sites to valid GeoJSON FeatureCollection', () => {
    const geoJson = CampaignGeolocationService.toGeoJSON(sites);
    expect(geoJson.type).toBe('FeatureCollection');
    expect(geoJson.features.length).toBe(2);
    expect(geoJson.features[0].geometry.coordinates).toEqual([32.5, 0.5]);
    expect(geoJson.features[0].properties.treesPlanted).toBe(1000);
  });

  it('calculates regional tree totals accurately', () => {
    expect(CampaignGeolocationService.calculateRegionalTotal(sites, 'East Africa')).toBe(1000);
    expect(CampaignGeolocationService.calculateRegionalTotal(sites, 'Amazon Basin')).toBe(2500);
    expect(CampaignGeolocationService.calculateRegionalTotal(sites, 'Asia')).toBe(0);
  });
});