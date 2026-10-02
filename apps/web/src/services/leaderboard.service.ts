/**
 * Monthly leaderboard for top sponsors and planters (issue #643).
 *
 * Points are recorded per address, bucketed by calendar month (UTC), following
 * the same store-injectable, localStorage-backed pattern as `social.service.ts`.
 * "Reset at month end" falls out naturally from the bucketing: each entry is
 * tagged with the month it was earned in, and `getMonthlyLeaderboard` only
 * reads the current (or requested) month's entries — no explicit reset job
 * is needed, and prior months remain available as history.
 *
 * Scoring is a placeholder pending real activity data:
 *  - Sponsors are scored by total stroops contributed this month.
 *  - Planters are scored by trees completed this month, mirroring the
 *    `trees_completed` field on the on-chain `PlanterMetrics` type
 *    (contracts/planter) — there is no SDK binding for that contract yet,
 *    so `recordPlanterCompletion` is called from application code in the
 *    meantime rather than reading the chain directly.
 */

export type LeaderboardRole = "sponsor" | "planter";

export type LeaderboardPoint = {
  address: string;
  points: number;
  month: string;
  createdAt: string;
};

export type LeaderboardEntry = {
  address: string;
  points: number;
  rank: number;
  bonus: BonusTier | null;
};

export type BonusTier = {
  type: "XLM" | "NFT" | "MERCH";
  label: string;
};

export interface LeaderboardStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SPONSOR_POINTS_KEY = "fundable:leaderboard-sponsor-points";
const PLANTER_POINTS_KEY = "fundable:leaderboard-planter-points";

const browserStore: LeaderboardStore = {
  getItem: (key) => (typeof window === "undefined" ? null : window.localStorage.getItem(key)),
  setItem: (key, value) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
};

/** Top-3 monthly bonus tiers, in rank order. */
export const BONUS_TIERS: readonly BonusTier[] = [
  { type: "XLM", label: "XLM bonus" },
  { type: "NFT", label: "Commemorative NFT" },
  { type: "MERCH", label: "Merchandise" },
];

export function getBonusForRank(rank: number): BonusTier | null {
  return BONUS_TIERS[rank - 1] ?? null;
}

export function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function keyFor(role: LeaderboardRole): string {
  return role === "sponsor" ? SPONSOR_POINTS_KEY : PLANTER_POINTS_KEY;
}

function read(store: LeaderboardStore, key: string): LeaderboardPoint[] {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as LeaderboardPoint[]) : [];
  } catch {
    return [];
  }
}

function write(store: LeaderboardStore, key: string, value: LeaderboardPoint[]): void {
  store.setItem(key, JSON.stringify(value));
}

function recordPoints(
  role: LeaderboardRole,
  address: string,
  points: number,
  store: LeaderboardStore,
  now: Date
): LeaderboardPoint | null {
  if (!address || !Number.isFinite(points) || points <= 0) return null;
  const key = keyFor(role);
  const entry: LeaderboardPoint = {
    address,
    points,
    month: monthKey(now),
    createdAt: now.toISOString(),
  };
  write(store, key, [...read(store, key), entry]);
  return entry;
}

/** Record a sponsor's contribution (in stroops) toward this month's leaderboard. */
export function recordSponsorContribution(
  address: string,
  amountStroops: number,
  store: LeaderboardStore = browserStore,
  now = new Date()
): LeaderboardPoint | null {
  return recordPoints("sponsor", address, amountStroops, store, now);
}

/** Record a planter completing one or more trees toward this month's leaderboard. */
export function recordPlanterCompletion(
  address: string,
  treesCompleted = 1,
  store: LeaderboardStore = browserStore,
  now = new Date()
): LeaderboardPoint | null {
  return recordPoints("planter", address, treesCompleted, store, now);
}

/** Ranked leaderboard for a role, for the given month (defaults to the current month). */
export function getMonthlyLeaderboard(
  role: LeaderboardRole,
  month: string = monthKey(),
  store: LeaderboardStore = browserStore
): LeaderboardEntry[] {
  const totals = new Map<string, number>();
  for (const point of read(store, keyFor(role))) {
    if (point.month !== month) continue;
    totals.set(point.address, (totals.get(point.address) ?? 0) + point.points);
  }

  return [...totals.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([address, points], index) => ({
      address,
      points,
      rank: index + 1,
      bonus: getBonusForRank(index + 1),
    }));
}
