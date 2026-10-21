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

/** Maximum number of custom milestones a creator may define. */
export const MAX_MILESTONES = 10;

/**
 * A creator-defined funding milestone. `percentage` is the funding threshold
 * (0–100, exclusive of 0) and `label` is the human-readable description shown
 * in notifications and on the campaign page.
 */
export interface CampaignMilestone {
  percentage: number;
  label: string;
}

/** Default milestones (25/50/75/100) with sensible default labels. */
export const DEFAULT_MILESTONES: CampaignMilestone[] = MILESTONE_PERCENTAGES.map(
  (percentage) => ({
    percentage,
    label: `${percentage}% funded`,
  })
);

/**
 * Validate a creator-supplied list of milestones. Returns an array of
 * human-readable error messages; an empty array means the list is valid.
 *
 * Rules:
 * - at most `MAX_MILESTONES` entries
 * - each percentage must be a finite number in (0, 100]
 * - percentages must be unique
 * - each label must be a non-empty string
 */
export function validateMilestones(milestones: CampaignMilestone[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(milestones)) {
    return ["Milestones must be an array."];
  }
  if (milestones.length > MAX_MILESTONES) {
    errors.push(`At most ${MAX_MILESTONES} milestones are allowed.`);
  }
  const seen = new Set<number>();
  milestones.forEach((milestone, index) => {
    const position = index + 1;
    const percentage = milestone?.percentage;
    if (
      typeof percentage !== "number" ||
      !Number.isFinite(percentage) ||
      percentage <= 0 ||
      percentage > 100
    ) {
      errors.push(`Milestone ${position}: percentage must be between 0 and 100.`);
    } else if (seen.has(percentage)) {
      errors.push(`Milestone ${position}: duplicate percentage ${percentage}%.`);
    } else {
      seen.add(percentage);
    }
    if (typeof milestone?.label !== "string" || milestone.label.trim() === "") {
      errors.push(`Milestone ${position}: label must not be empty.`);
    }
  });
  return errors;
}

/**
 * Return the milestones newly crossed when funding moves from `previousRaised`
 * to `newRaised` against `goalAmount`. Milestones already achieved at the
 * previous total are not returned, so each milestone fires at most once.
 */
export function evaluateMilestones(
  milestones: CampaignMilestone[],
  previousRaised: string | number,
  newRaised: string | number,
  goalAmount: string | number
): CampaignMilestone[] {
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return [];
  }
  const previousProgress = calculateFundingProgress(previousRaised, goalAmount);
  const newProgress = calculateFundingProgress(newRaised, goalAmount);
  if (newProgress <= previousProgress) {
    return [];
  }
  return milestones
    .filter(
      (milestone) =>
        milestone.percentage > previousProgress && milestone.percentage <= newProgress
    )
    .sort((a, b) => a.percentage - b.percentage);
}

/** A milestone annotated with its achieved state, for the progress bar UI. */
export interface MilestoneProgressEntry extends CampaignMilestone {
  achieved: boolean;
}

/**
 * Return each milestone annotated with an `achieved` flag based on the current
 * funding progress. Results are sorted ascending by percentage.
 */
export function getMilestoneProgress(
  milestones: CampaignMilestone[],
  raised: string | number,
  goal: string | number
): MilestoneProgressEntry[] {
  const progress = calculateFundingProgress(raised, goal);
  return [...(Array.isArray(milestones) ? milestones : [])]
    .sort((a, b) => a.percentage - b.percentage)
    .map((milestone) => ({
      ...milestone,
      achieved: progress >= milestone.percentage,
    }));
}

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
