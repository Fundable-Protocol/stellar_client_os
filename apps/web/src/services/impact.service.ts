/**
 * Impact Service — Sponsor impact comparison (issue #639)
 *
 * Client-side helper for fetching a sponsor's impact metrics — estimated
 * CO2 offset vs the global average sponsor plus a ranking percentile
 * (top 10%, etc.) — from the GraphQL analytics gateway at `/api/graphql`.
 *
 * @example
 * import { fetchSponsorImpact } from "@/services/impact.service";
 *
 * const impact = await fetchSponsorImpact("GAAA...");
 * // → { myCo2OffsetKg: 250, rankingBand: "top_10", ... }
 */

// ── Types ─────────────────────────────────────────────────────────────────────
// Keep in sync with the `SponsorImpact` / `RankingBand` types returned by the
// GraphQL gateway (see `src/graphql/schema.ts` and `src/graphql/analytics.service.ts`).

/**
 * Leaderboard bucket for a sponsor based on their impact percentile.
 */
export type RankingBand =
  | "top_1"
  | "top_5"
  | "top_10"
  | "top_25"
  | "top_50"
  | "below_average";

/**
 * A single sponsor's impact compared with the global average sponsor.
 */
export interface SponsorImpact {
  /** The sponsor's Stellar address. */
  address: string;
  /** Total volume funded by this sponsor (USDC-equivalent, as string). */
  myVolumeUsd: string;
  /** Estimated CO2 offset from this sponsor's funding (kg CO2e). */
  myCo2OffsetKg: number;
  /** Average volume funded per sponsor (USDC-equivalent, as string). */
  globalAverageVolumeUsd: string;
  /** Estimated CO2 offset of the average sponsor (kg CO2e). */
  globalAverageCo2OffsetKg: number;
  /** Number of unique sponsors (senders) in the dataset. */
  globalSponsorCount: number;
  /**
   * Percentage of sponsors this sponsor beats (0–100).
   * `null` when there is no sponsor data to compare against.
   */
  percentile: number | null;
  /** Ranking band (e.g. "top_10"). `null` when there is no data. */
  rankingBand: RankingBand | null;
  /** CO2 conversion factor applied (kg CO2e per 1 USD funded). */
  co2PerUsdKg: number;
}

// ── GraphQL query ─────────────────────────────────────────────────────────────

export const SPONSOR_IMPACT_QUERY = /* GraphQL */ `
  query SponsorImpact($address: String!) {
    sponsorImpact(address: $address) {
      address
      myVolumeUsd
      myCo2OffsetKg
      globalAverageVolumeUsd
      globalAverageCo2OffsetKg
      globalSponsorCount
      percentile
      rankingBand
      co2PerUsdKg
    }
  }
`;

// ── Fetch helper ──────────────────────────────────────────────────────────────

/**
 * Fetch a sponsor's impact comparison from the GraphQL analytics gateway.
 *
 * @param address - Stellar address of the sponsor to compare.
 * @param signal  - Optional AbortSignal for request cancellation.
 * @throws {Error} When the network request fails or the gateway returns errors.
 */
export async function fetchSponsorImpact(
  address: string,
  signal?: AbortSignal
): Promise<SponsorImpact> {
  const response = await fetch("/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: SPONSOR_IMPACT_QUERY,
      variables: { address },
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load impact comparison (HTTP ${response.status})`
    );
  }

  const payload = (await response.json()) as {
    data?: { sponsorImpact?: SponsorImpact };
    errors?: { message: string }[];
  };

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(payload.errors[0].message);
  }

  const impact = payload.data?.sponsorImpact;
  if (!impact) {
    throw new Error("Impact comparison returned no data");
  }

  return impact;
}
