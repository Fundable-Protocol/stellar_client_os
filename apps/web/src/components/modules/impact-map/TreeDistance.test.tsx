import { describe, expect, it } from "vitest";
import { distanceInKm, formatDistance } from "./TreeDistance";

describe("TreeDistance", () => {
  it("returns zero for identical coordinates", () => expect(distanceInKm(0, 0, 0, 0)).toBe(0));
  it("formats metric distances", () => {
    expect(formatDistance(0.42)).toBe("420 m away");
    expect(formatDistance(12.4)).toBe("12 km away");
  });
});
