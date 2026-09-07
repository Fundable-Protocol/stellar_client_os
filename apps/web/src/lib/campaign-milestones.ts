/**
 * Campaign funding milestone helpers — used by the milestone achievement badges
 * on the campaign detail page.
 *
 * Milestones are triggered when funding reaches 25%, 50%, 75% and 100% of the
 * campaign goal (Issue: display milestone achievement badges).
 */

/** The canonical funding milestones, in ascending order. */
export const MILESTONE_PERCENTAGES = [25, 50, 75, 100] as const;

export type MilestonePercentage = (typeof MILESTONE_PERCENTAGES)[number];

/**
 * Parse a funding amount that may come as a number, a string like "33,850",
 * "50,000", or even "33,850.00 XLM". Never returns NaN — falls back to 0.
 */
export function parseFundingAmount(value: string | number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  // Strip thousands separators and any non-numeric tokens (e.g. token symbol).
  const cleaned = String(value).replace(/,/g, "").replace(/[^0-9.\-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Calculate the funding progress percentage (0–100), rounded to the nearest
 * whole number. Returns 0 when the goal is missing or non-positive so we never
 * divide by zero or produce a negative percentage.
 */
export function calculateFundingProgress(
  raisedAmount: string | number,
  goalAmount: string | number
): number {
  const raised = parseFundingAmount(raisedAmount);
  const goal = parseFundingAmount(goalAmount);
  if (!Number.isFinite(raised) || !Number.isFinite(goal) || goal <= 0) {
    return 0;
  }
  const raw = (raised / goal) * 100;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Return the milestone percentages that have been achieved for a given funding
 * progress percentage (0–100). A milestone is achieved once progress reaches
 * its threshold.
 */
export function getAchievedMilestonePercentages(progress: number): MilestonePercentage[] {
  const safeProgress = Math.min(100, Math.max(0, progress));
  return MILESTONE_PERCENTAGES.filter((p) => safeProgress >= p);
}

/**
 * Return the next milestone that has NOT yet been achieved for the given
 * progress, or `null` when every milestone has been reached.
 */
export function getNextMilestone(progress: number): MilestonePercentage | null {
  const safeProgress = Math.min(100, Math.max(0, progress));
  return MILESTONE_PERCENTAGES.find((p) => safeProgress < p) ?? null;
}
