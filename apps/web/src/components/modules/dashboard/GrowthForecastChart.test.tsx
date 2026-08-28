import { describe, expect, it } from "vitest";
import { growthForecast } from "./GrowthForecastChart";

describe("growthForecast", () => {
  it("starts at the supplied age and returns a monotonic species curve", () => {
    const data = growthForecast("Teak", 2, 4);
    expect(data).toHaveLength(5);
    expect(data[0].year).toBe(2);
    expect(data[4].biomassKg).toBeGreaterThan(data[0].biomassKg);
  });

  it("uses a safe default for unknown species", () => {
    expect(growthForecast("Unknown", 0, 1)[1].biomassKg).toBeGreaterThan(0);
  });
});
