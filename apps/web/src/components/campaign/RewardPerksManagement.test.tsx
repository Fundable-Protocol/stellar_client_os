import { describe, expect, it } from "vitest";
import { calculateSpots } from "./RewardPerksManagement";

describe("RewardPerksManagement (#1178)", () => {
  it("calculates available spots and sold-out states correctly", () => {
    // 50 spots limit, 15 claimed -> 35 available, not sold out
    const state1 = calculateSpots(50, 15);
    expect(state1.available).toBe(35);
    expect(state1.isSoldOut).toBe(false);

    // 20 spots limit, 20 claimed -> 0 available, sold out
    const state2 = calculateSpots(20, 20);
    expect(state2.available).toBe(0);
    expect(state2.isSoldOut).toBe(true);

    // Edge case: claimed exceeds limit (due to concurrent txs) -> 0 available, sold out
    const state3 = calculateSpots(10, 12);
    expect(state3.available).toBe(0);
    expect(state3.isSoldOut).toBe(true);
  });
});
