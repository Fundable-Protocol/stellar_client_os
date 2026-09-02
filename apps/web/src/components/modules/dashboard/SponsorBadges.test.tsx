import { describe, expect, it } from "vitest";
import { getSponsorBadge } from "./SponsorBadges";

describe("getSponsorBadge", () => {
  it("assigns each threshold badge", () => {
    expect(getSponsorBadge(0)).toBeNull();
    expect(getSponsorBadge(1)).toBe("Bronze");
    expect(getSponsorBadge(10)).toBe("Silver");
    expect(getSponsorBadge(50)).toBe("Gold");
    expect(getSponsorBadge(100)).toBe("Platinum");
  });
});
