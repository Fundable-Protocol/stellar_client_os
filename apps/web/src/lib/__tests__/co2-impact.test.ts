import { describe, expect, it } from "vitest";
import {
  calculateCo2Forecast,
  calculateCo2Offset,
  DEFAULT_SPECIES_ID,
  FORECAST_HORIZON_YEARS,
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
    expect(calculateCo2Offset("oak", Number.POSITIVE_INFINITY).co2PerYearKg).toBe(0);
  });

  it("provides a car-km equivalence for the annual figure", () => {
    const result = calculateCo2Offset("oak", 10);
    // 210 kg / 0.12 kg per km = 1750 km
    expect(result.carKmEquivalentPerYear).toBe(1750);
  });
});

describe("calculateCo2Forecast", () => {
  it("returns a cumulative estimate and 95% interval for each of 20 years", () => {
    const forecast = calculateCo2Forecast("oak", 10);
    const yearTen = forecast[9];
    const yearTwenty = forecast[19];

    expect(forecast).toHaveLength(FORECAST_HORIZON_YEARS);
    expect(yearTen.year).toBe(10);
    expect(yearTwenty.year).toBe(20);
    expect(yearTwenty.expectedCumulativeKg).toBeGreaterThan(yearTen.expectedCumulativeKg);
    expect(yearTwenty.lower95Kg).toBeLessThan(yearTwenty.expectedCumulativeKg);
    expect(yearTwenty.upper95Kg).toBeGreaterThan(yearTwenty.expectedCumulativeKg);
  });

  it("includes tree growth, mortality, and climate in the estimate", () => {
    const oak = calculateCo2Forecast("oak", 10)[19];
    const eucalyptus = calculateCo2Forecast("eucalyptus", 10)[19];

    expect(eucalyptus.expectedCumulativeKg).toBeGreaterThan(oak.expectedCumulativeKg);
    expect(oak.expectedCumulativeKg).toBeLessThan(21 * 10 * FORECAST_HORIZON_YEARS);
  });

  it("clamps invalid quantities to zero without a non-zero confidence range", () => {
    const forecast = calculateCo2Forecast("oak", Number.POSITIVE_INFINITY);

    expect(forecast.every((year) => (
      year.expectedCumulativeKg === 0 &&
      year.lower95Kg === 0 &&
      year.upper95Kg === 0
    ))).toBe(true);
  });
});
