import { describe, expect, it } from "vitest";
import {
  calculateCo2Offset,
  DEFAULT_SPECIES_ID,
  getTreeSpecies,
  TREE_SPECIES,
} from "../co2-impact";

describe("TREE_SPECIES", () => {
  it("exposes a non-empty list with unique ids", () => {
    expect(TREE_SPECIES.length).toBeGreaterThan(0);
    const ids = TREE_SPECIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns the default species for an unknown id", () => {
    const species = getTreeSpecies("not-a-species");
    expect(species.id).toBe(DEFAULT_SPECIES_ID);
  });
});

describe("calculateCo2Offset", () => {
  it("computes annual and 10-year projections from species and quantity", () => {
    const result = calculateCo2Offset("oak", 10);
    expect(result.quantity).toBe(10);
    expect(result.co2PerYearKg).toBe(210); // 10 * 21
    expect(result.co2PerYearTonnes).toBeCloseTo(0.21);
    expect(result.co2Over10YearsKg).toBe(2100);
    expect(result.co2Over10YearsTonnes).toBeCloseTo(2.1);
  });

  it("uses the selected species uptake rate", () => {
    const eucalyptus = calculateCo2Offset("eucalyptus", 1);
    const oak = calculateCo2Offset("oak", 1);
    expect(eucalyptus.co2PerYearKg).toBeGreaterThan(oak.co2PerYearKg);
  });

  it("clamps zero and negative quantities to zero", () => {
    expect(calculateCo2Offset("oak", 0).co2PerYearKg).toBe(0);
    expect(calculateCo2Offset("oak", -5).co2PerYearKg).toBe(0);
  });

  it("provides a car-km equivalence for the annual figure", () => {
    const result = calculateCo2Offset("oak", 10);
    // 210 kg / 0.12 kg per km = 1750 km
    expect(result.carKmEquivalentPerYear).toBe(1750);
  });
});
