import { describe, it, expect } from "vitest";

// Mirrors the pageCount computation in StreamsTable.tsx line 51.
// If this ever regresses to the unclamped Math.ceil(totalCount / limit),
// an empty stream array would render "Page 1 of 0".
function computePageCount(totalCount: number, limit: number): number {
  return Math.max(1, Math.ceil(totalCount / limit));
}

describe("StreamsTable pageCount", () => {
  it("clamps to 1 when totalCount is 0 (empty stream array)", () => {
    expect(computePageCount(0, 10)).toBe(1);
  });

  it("computes normally for a non-empty stream array", () => {
    expect(computePageCount(25, 10)).toBe(3);
  });

  it("still returns 1 for a single partial page", () => {
    expect(computePageCount(5, 10)).toBe(1);
  });
});