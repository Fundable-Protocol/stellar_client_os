/**
 * Campaign Tree Species Diversity Service — issue #991
 *
 * Client-side mirror of the `campaign-diversity` Soroban contract's scoring
 * formula. The contract is the source of truth; this module exists so the UI
 * can render a diversity score from an optimistic planting estimate, and so
 * off-chain consumers (dashboards, sponsor receipts) can re-derive a score
 * from raw species counts and check that the chain agrees.
 *
 * The score answers "how biodiverse is this planting?" on a `0 .. 10000`
 * basis-point scale, where `10000` is the best possible planting. It is the
 * product of two factors:
 *
 *   1. Species coverage — a linear ramp in the number of distinct verified
 *      species, reaching full marks at {@link MAX_DIVERSITY_SPECIES}.
 *   2. Species evenness — Simpson's diversity index normalised against its own
 *      maximum, so a perfectly even planting earns full marks.
 *
 * The evenness factor is what stops the score from being a raw species count:
 * ten thousand monoculture trees score `0`, while twelve species planted in
 * equal proportion score `10000`.
 *
 * @example
 * import { computeDiversityScore } from "@/services/campaign-diversity.service";
 *
 * computeDiversityScore([{ treeCount: 100 }, { treeCount: 100 }]);
 * // → 1666
 */

/** Verification state of a single planting batch. Mirrors the contract enum. */
export type PlantingStatus = "pending" | "verified" | "rejected";

/**
 * Environmental-value band derived from a diversity score. Mirrors the
 * contract's `BiodiversityTier` enum.
 */
export type BiodiversityTier = "Low" | "Medium" | "High";

/** A single species' contribution to a planting. */
export interface SpeciesPlantingInput {
  /** Number of trees of this species that passed verification. */
  treeCount: number;
}

/** One planting batch as returned by the contract. */
export interface DiversityPlantingRecord {
  campaignId: string;
  plantingId: number;
  /** Hex SHA-256 digest of the lower-cased species name. */
  speciesCode: string;
  speciesName: string;
  treeCount: number;
  reporter: string;
  recordedAt: number;
  verifiedAt: number;
  rejectedAt: number;
  status: PlantingStatus;
}

/** Aggregate biodiversity record for one campaign. */
export interface DiversityCampaignRecord {
  campaignId: string;
  registrar: string;
  plantedTreeCount: number;
  verifiedTreeCount: number;
  verifiedSpeciesCount: number;
  /** `0 .. 10000` basis points. */
  diversityScore: number;
  tier: BiodiversityTier;
  isSealed: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Full scale of the diversity score: `10000` basis points = 100 %. */
export const MAX_SCORE = 10_000;

/**
 * Number of distinct species at which the species-coverage factor saturates.
 * Mirrors the contract's `MAX_DIVERSITY_SPECIES`.
 */
export const MAX_DIVERSITY_SPECIES = 12;

/** Lower bound of the `Medium` band. Mirrors the contract's `TIER_MEDIUM_MIN`. */
export const TIER_MEDIUM_MIN = 2_500;

/** Lower bound of the `High` band. Mirrors the contract's `TIER_HIGH_MIN`. */
export const TIER_HIGH_MIN = 7_500;

/** Minimum verified trees before a campaign can be screened for credits. */
export const CARBON_CREDIT_MIN_TREES = 1_000;

/** Minimum diversity score before a campaign can be screened for credits. */
export const CARBON_CREDIT_MIN_SCORE = 5_000;

/**
 * Compute the species-coverage factor, in basis points.
 *
 * A linear ramp that reaches full marks at {@link MAX_DIVERSITY_SPECIES}.
 * Twelve native species on one site is the point at which additional species
 * no longer meaningfully change the ecological value of a restoration.
 */
export function speciesCoverageBps(speciesCount: number): number {
  if (speciesCount <= 0) return 0;
  const capped = Math.min(speciesCount, MAX_DIVERSITY_SPECIES);
  return Math.floor((capped * MAX_SCORE) / MAX_DIVERSITY_SPECIES);
}

/**
 * Compute the species-evenness factor, in basis points.
 *
 * Simpson's diversity index `D = sum(n_i * (n_i - 1)) / (N * (N - 1))`,
 * normalised against its maximum so that a perfectly even planting scores
 * `10000` rather than the value the raw index converges to:
 *
 *   evenness = (1 - D) / (1 - 1 / S) = S * (T - A) / (T * (S - 1))
 *
 * where `T = N * (N - 1)`, `A = sum(n_i * (n_i - 1))` and `S` is the species
 * count. A monoculture scores `0`.
 */
export function speciesEvennessBps(treeCounts: number[]): number {
  const counts = treeCounts.filter((n) => Number.isFinite(n) && n > 0);
  const speciesCount = counts.length;
  const totalTrees = counts.reduce((sum, n) => sum + n, 0);

  // Fewer than two verified trees, or a single verified species, means there
  // is no evenness to measure.
  if (speciesCount < 2 || totalTrees < 2) return 0;

  const totalPairs = BigInt(totalTrees) * BigInt(totalTrees - 1);
  if (totalPairs === 0n) return 0;
  const sameSpeciesPairs = counts.reduce(
    (sum, n) => sum + BigInt(n) * BigInt(n - 1),
    0n,
  );

  // `sameSpeciesPairs` cannot exceed `totalPairs` for a consistent input, but
  // clamp rather than produce a negative numerator if it somehow does.
  const differentPairs =
    sameSpeciesPairs > totalPairs ? 0n : totalPairs - sameSpeciesPairs;

  const numerator = BigInt(speciesCount) * differentPairs * BigInt(MAX_SCORE);
  const denominator = totalPairs * BigInt(speciesCount - 1);
  const evenness = Number(numerator / denominator);

  // The normalised index overshoots by a hair for a perfectly even planting,
  // because the without-replacement correction only reaches 1 asymptotically.
  return Math.min(evenness, MAX_SCORE);
}

/**
 * Compute the diversity score of a planting, in basis points `0 .. 10000`.
 *
 * @param species - Verified tree counts, one entry per distinct species.
 * @returns the combined coverage and evenness score.
 */
export function computeDiversityScore(species: SpeciesPlantingInput[]): number {
  const treeCounts = species.map((entry) => entry.treeCount);
  const coverage = speciesCoverageBps(treeCounts.length);
  const evenness = speciesEvennessBps(treeCounts);
  if (coverage === 0 || evenness === 0) return 0;
  return Math.floor((coverage * evenness) / MAX_SCORE);
}

/**
 * Derive the diversity score from a list of planting batches, counting only
 * the batches that reached the `verified` state.
 */
export function diversityScoreFromPlantings(
  plantings: DiversityPlantingRecord[]
): number {
  const verified = plantings.filter((p) => p.status === "verified");
  const byCode = new Map<string, number>();
  for (const planting of verified) {
    byCode.set(
      planting.speciesCode,
      (byCode.get(planting.speciesCode) ?? 0) + planting.treeCount
    );
  }
  return computeDiversityScore(
    Array.from(byCode.values()).map((treeCount) => ({ treeCount }))
  );
}

/** Map a diversity score onto its environmental-value band. */
export function tierForScore(score: number): BiodiversityTier {
  if (score >= TIER_HIGH_MIN) return "High";
  if (score >= TIER_MEDIUM_MIN) return "Medium";
  return "Low";
}

/**
 * Screen a campaign against the on-chain bar for carbon-credit issuance: at
 * least {@link CARBON_CREDIT_MIN_TREES} verified trees and a diversity score of
 * at least {@link CARBON_CREDIT_MIN_SCORE}.
 *
 * This is a screening signal, not an issuance decision: it deliberately says
 * nothing about location, survival rates or permanence.
 */
export function isCarbonCreditEligible(
  verifiedTreeCount: number,
  diversityScore: number
): boolean {
  return (
    verifiedTreeCount >= CARBON_CREDIT_MIN_TREES &&
    diversityScore >= CARBON_CREDIT_MIN_SCORE
  );
}

/** Convert a basis-point score to a rounded percentage, for display. */
export function diversityScorePercent(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.min(100, Math.round((score / MAX_SCORE) * 100));
}

/**
 * Human-readable explanation of a score, so the UI can justify the number
 * rather than presenting it as a black box.
 */
export function describeDiversityScore(
  speciesCount: number,
  score: number,
  evennessBps?: number
): string {
  if (speciesCount === 0) return "No verified plantings yet.";
  if (speciesCount === 1) {
    return "Single-species planting (monoculture): 0% diversity value.";
  }

  const percent = diversityScorePercent(score);
  const coverage = diversityScorePercent(speciesCoverageBps(speciesCount));
  const evenness =
    evennessBps === undefined
      ? "unevenness not stated"
      : `${diversityScorePercent(evennessBps)}% species balance`;
  const full = speciesCount >= MAX_DIVERSITY_SPECIES ? "full" : "partial";

  return `${percent}% diversity value — ${full} species coverage (${coverage}%) and ${evenness}.`;
}
