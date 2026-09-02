import { describe, expect, it } from "vitest";
import {
  getBonusForRank,
  getMonthlyLeaderboard,
  monthKey,
  recordPlanterCompletion,
  recordSponsorContribution,
  type LeaderboardStore,
} from "./leaderboard.service";

function memoryStore(): LeaderboardStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const JAN = new Date("2026-01-15T00:00:00Z");
const FEB = new Date("2026-02-01T00:00:00Z");

describe("leaderboard.service", () => {
  it("ranks sponsors by total points, highest first", () => {
    const store = memoryStore();
    recordSponsorContribution("alice", 500, store, JAN);
    recordSponsorContribution("bob", 900, store, JAN);
    recordSponsorContribution("alice", 600, store, JAN); // second contribution, same month

    const board = getMonthlyLeaderboard("sponsor", monthKey(JAN), store);

    expect(board.map((e) => e.address)).toEqual(["alice", "bob"]);
    expect(board[0].points).toBe(1100);
    expect(board[1].points).toBe(900);
  });

  it("assigns bonus tiers to the top 3 ranks only", () => {
    const store = memoryStore();
    recordPlanterCompletion("p1", 10, store, JAN);
    recordPlanterCompletion("p2", 8, store, JAN);
    recordPlanterCompletion("p3", 6, store, JAN);
    recordPlanterCompletion("p4", 4, store, JAN);

    const board = getMonthlyLeaderboard("planter", monthKey(JAN), store);

    expect(board[0].bonus?.type).toBe("XLM");
    expect(board[1].bonus?.type).toBe("NFT");
    expect(board[2].bonus?.type).toBe("MERCH");
    expect(board[3].bonus).toBeNull();
  });

  it("resets standings at month end — prior months don't leak into the current one", () => {
    const store = memoryStore();
    recordSponsorContribution("alice", 5000, store, JAN);

    const febBoard = getMonthlyLeaderboard("sponsor", monthKey(FEB), store);
    const janBoard = getMonthlyLeaderboard("sponsor", monthKey(JAN), store);

    expect(febBoard).toEqual([]);
    expect(janBoard).toHaveLength(1);
  });

  it("keeps sponsor and planter points in separate boards", () => {
    const store = memoryStore();
    recordSponsorContribution("shared-address", 100, store, JAN);
    recordPlanterCompletion("shared-address", 3, store, JAN);

    const sponsorBoard = getMonthlyLeaderboard("sponsor", monthKey(JAN), store);
    const planterBoard = getMonthlyLeaderboard("planter", monthKey(JAN), store);

    expect(sponsorBoard[0].points).toBe(100);
    expect(planterBoard[0].points).toBe(3);
  });

  it("ignores invalid or non-positive point amounts", () => {
    const store = memoryStore();
    expect(recordSponsorContribution("", 100, store, JAN)).toBeNull();
    expect(recordSponsorContribution("alice", 0, store, JAN)).toBeNull();
    expect(recordSponsorContribution("alice", -5, store, JAN)).toBeNull();
    expect(recordSponsorContribution("alice", NaN, store, JAN)).toBeNull();

    expect(getMonthlyLeaderboard("sponsor", monthKey(JAN), store)).toEqual([]);
  });

  it("exposes bonus lookup by rank directly", () => {
    expect(getBonusForRank(1)?.type).toBe("XLM");
    expect(getBonusForRank(2)?.type).toBe("NFT");
    expect(getBonusForRank(3)?.type).toBe("MERCH");
    expect(getBonusForRank(4)).toBeNull();
  });
});
