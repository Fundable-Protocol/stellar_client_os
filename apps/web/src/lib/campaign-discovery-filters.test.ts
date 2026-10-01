import { describe, expect, it } from "vitest";
import { filterCampaignsByDiscoveryOptions, getCampaignDiscoveryRegion } from "./campaign-discovery-filters";

const campaigns = [
  { id: "oak-us", treeSpecies: "Oak", location: "California, United States" },
  { id: "pine-ca", treeSpecies: "Pine trees", gpsLocations: [{ latitude: 45.5, longitude: -73.6 }] },
  { id: "mangrove-ke", treeSpecies: "Mangrove", location: "Kenya" },
  { id: "oak-in", treeSpecies: "Oak", region: "Asia", location: "India" },
  { id: "unknown", treeSpecies: "Cedar", location: "Somewhere" },
];

describe("campaign discovery filters", () => {
  it("filters campaigns by the selected species", () => {
    expect(filterCampaignsByDiscoveryOptions(campaigns, { treeSpecies: "Oak", region: "All" }).map(({ id }) => id))
      .toEqual(["oak-us", "oak-in"]);
  });

  it("filters by an explicit or location-derived geographic region", () => {
    expect(filterCampaignsByDiscoveryOptions(campaigns, { treeSpecies: "All", region: "Africa" }).map(({ id }) => id))
      .toEqual(["mangrove-ke"]);
    expect(getCampaignDiscoveryRegion(campaigns[3])).toBe("Asia");
  });

  it("derives region from GPS coordinates when no region is provided", () => {
    expect(getCampaignDiscoveryRegion(campaigns[1])).toBe("North America");
  });

  it("applies species and region filters together and excludes unknown metadata", () => {
    expect(filterCampaignsByDiscoveryOptions(campaigns, { treeSpecies: "Mangrove", region: "Africa" }).map(({ id }) => id))
      .toEqual(["mangrove-ke"]);
    expect(filterCampaignsByDiscoveryOptions(campaigns, { treeSpecies: "Pine", region: "Asia" })).toEqual([]);
  });
});
