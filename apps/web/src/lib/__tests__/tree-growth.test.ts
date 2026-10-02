import { describe, expect, it } from "vitest";
import {
  getTreeGrowthStageData,
  getTreeProfile,
  SPECIES_PROFILES,
  TIMELINE_OPTIONS,
  type TreeGrowthTimeline,
} from "../tree-growth";

describe("tree-growth domain model", () => {
  it("provides comprehensive profiles for all supported tree types", () => {
    expect(Object.keys(SPECIES_PROFILES).length).toBeGreaterThan(5);
    const species = ["Oak", "Pine", "Mangrove", "Acacia", "Cedar", "Fruit Tree", "Baobab", "Redwood", "Birch"];
    species.forEach((type) => {
      const profile = getTreeProfile(type);
      expect(profile).toBeDefined();
      expect(profile.name).toBeTruthy();
      expect(profile.maxMaturityHeightMeters).toBeGreaterThan(5);
      expect(profile.maxCanopyDiameterMeters).toBeGreaterThan(3);
    });
  });

  it("falls back to default Oak profile for unknown species", () => {
    const profile = getTreeProfile("UnknownTree");
    expect(profile.name).toBe("White Oak");
  });

  it("calculates sequential physical growth across 0, 5, 10, and 20 years", () => {
    const timelines: TreeGrowthTimeline[] = ["baseline", "5yr", "10yr", "20yr"];
    const stages = timelines.map((t) => getTreeGrowthStageData("Oak", t, 1));

    // Verify heights monotonically increase
    expect(stages[0].heightMeters).toBeLessThan(stages[1].heightMeters);
    expect(stages[1].heightMeters).toBeLessThan(stages[2].heightMeters);
    expect(stages[2].heightMeters).toBeLessThan(stages[3].heightMeters);

    // Verify canopy spreads monotonically increase
    expect(stages[0].canopyDiameterMeters).toBeLessThan(stages[1].canopyDiameterMeters);
    expect(stages[1].canopyDiameterMeters).toBeLessThan(stages[2].canopyDiameterMeters);
    expect(stages[2].canopyDiameterMeters).toBeLessThan(stages[3].canopyDiameterMeters);

    // Verify trunk calipers monotonically increase
    expect(stages[0].trunkCaliperCm).toBeLessThan(stages[1].trunkCaliperCm);
    expect(stages[1].trunkCaliperCm).toBeLessThan(stages[2].trunkCaliperCm);
    expect(stages[2].trunkCaliperCm).toBeLessThan(stages[3].trunkCaliperCm);

    // Verify visual scales monotonically increase
    expect(stages[0].visualScale).toBeLessThan(stages[1].visualScale);
    expect(stages[1].visualScale).toBeLessThan(stages[2].visualScale);
    expect(stages[2].visualScale).toBeLessThan(stages[3].visualScale);
  });

  it("calculates cumulative CO2 sequestration and oxygen production over time", () => {
    const stage5 = getTreeGrowthStageData("Oak", "5yr", 10);
    const stage10 = getTreeGrowthStageData("Oak", "10yr", 10);
    const stage20 = getTreeGrowthStageData("Oak", "20yr", 10);

    expect(stage5.cumulativeCo2Kg).toBeGreaterThan(0);
    expect(stage10.cumulativeCo2Kg).toBeGreaterThan(stage5.cumulativeCo2Kg);
    expect(stage20.cumulativeCo2Kg).toBeGreaterThan(stage10.cumulativeCo2Kg);

    expect(stage20.cumulativeCo2Tonnes).toBe(Number((stage20.cumulativeCo2Kg / 1000).toFixed(2)));
    expect(stage20.oxygenProducedKg).toBeGreaterThan(stage20.cumulativeCo2Kg);
  });

  it("handles high tree quantities linearly", () => {
    const single = getTreeGrowthStageData("Pine", "10yr", 1);
    const hundred = getTreeGrowthStageData("Pine", "10yr", 100);

    expect(hundred.cumulativeCo2Kg).toBe(single.cumulativeCo2Kg * 100);
    expect(hundred.waterFilteredLiters).toBe(single.waterFilteredLiters * 100);
  });

  it("exposes all required timeline options (5, 10, 20 year)", () => {
    const ids = TIMELINE_OPTIONS.map((opt) => opt.id);
    expect(ids).toContain("5yr");
    expect(ids).toContain("10yr");
    expect(ids).toContain("20yr");
  });
});
