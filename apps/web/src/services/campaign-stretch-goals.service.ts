/**
 * Time-limited stretch goals (e.g. 24-hour bonuses).
 *
 * Creators can attach stretch goals that unlock special backer rewards
 * when the campaign's main funding goal is reached *within* a configured
 * window (windowStartsAt … windowEndsAt). Stretch goals that miss the
 * window expire without unlocking rewards.
 */

import {
  getCampaign,
  getCampaignDataSource,
  type CampaignDataSource,
  type CampaignRecord,
} from "./campaign.service";

export type StretchGoalStatus = "pending" | "unlocked" | "expired";

export interface StretchGoalReward {
  id: string;
  title: string;
  description?: string;
}

export interface StretchGoal {
  id: string;
  campaignId: string;
  title: string;
  description?: string;
  /** Extra funding target beyond the main goal (integer string). Optional. */
  targetAmount?: string;
  /** Inclusive start of the time window (unix ms). */
  windowStartsAt: number;
  /** Exclusive end of the time window (unix ms). */
  windowEndsAt: number;
  rewards: StretchGoalReward[];
  status: StretchGoalStatus;
  unlockedAt?: number;
  expiredAt?: number;
  createdBy: string;
  createdAt: number;
}

export interface StretchGoalInput {
  title: string;
  description?: string;
  targetAmount?: string;
  /** Window length in milliseconds. Defaults to 24 hours. */
  durationMs?: number;
  windowStartsAt?: number;
  windowEndsAt?: number;
  rewards: Array<{ title: string; description?: string }>;
}

export const DEFAULT_STRETCH_WINDOW_MS = 24 * 60 * 60 * 1000;

function parseAmount(value: string | undefined): bigint {
  if (!value) return 0n;
  if (!/^\d+$/.test(value)) {
    throw new Error("amount must be a non-negative integer string");
  }
  return BigInt(value);
}

export function isMainGoalReached(campaign: CampaignRecord): boolean {
  try {
    return BigInt(campaign.raisedAmount ?? "0") >= BigInt(campaign.goalAmount || "0") &&
      BigInt(campaign.goalAmount || "0") > 0n;
  } catch {
    return false;
  }
}

export function isWithinStretchWindow(
  goal: Pick<StretchGoal, "windowStartsAt" | "windowEndsAt">,
  now: number,
): boolean {
  return now >= goal.windowStartsAt && now < goal.windowEndsAt;
}

export function evaluateStretchGoalStatus(
  goal: StretchGoal,
  campaign: CampaignRecord,
  now = Date.now(),
): StretchGoal {
  if (goal.status === "unlocked") return goal;

  const inWindow = isWithinStretchWindow(goal, now);
  const mainReached = isMainGoalReached(campaign);
  const extraOk =
    !goal.targetAmount ||
    BigInt(campaign.raisedAmount ?? "0") >= parseAmount(goal.targetAmount);

  if (inWindow && mainReached && extraOk) {
    return { ...goal, status: "unlocked", unlockedAt: now };
  }

  if (!inWindow && now >= goal.windowEndsAt && goal.status !== "unlocked") {
    return { ...goal, status: "expired", expiredAt: goal.expiredAt ?? now };
  }

  return goal;
}

export function getUnlockedRewardsForBackers(
  campaign: CampaignRecord,
  now = Date.now(),
): StretchGoalReward[] {
  const goals = (campaign.stretchGoals ?? []).map((g) =>
    evaluateStretchGoalStatus(g, campaign, now),
  );
  return goals
    .filter((g) => g.status === "unlocked")
    .flatMap((g) => g.rewards);
}

export async function addCampaignStretchGoal(
  campaignId: string,
  createdBy: string,
  input: StretchGoalInput,
  dataSource: CampaignDataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<StretchGoal> {
  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.creator !== createdBy) {
    throw new Error("Only the campaign creator can set stretch goals");
  }
  if (!input.title?.trim()) throw new Error("Stretch goal title is required");
  if (!input.rewards?.length) throw new Error("At least one reward is required");
  if (input.rewards.some((r) => !r.title?.trim())) {
    throw new Error("Each reward must have a title");
  }
  if (input.targetAmount !== undefined) parseAmount(input.targetAmount);

  const windowStartsAt = input.windowStartsAt ?? now;
  const windowEndsAt =
    input.windowEndsAt ??
    windowStartsAt + (input.durationMs ?? DEFAULT_STRETCH_WINDOW_MS);

  if (windowEndsAt <= windowStartsAt) {
    throw new Error("Stretch goal window must end after it starts");
  }

  const goal: StretchGoal = {
    id: `${campaign.id}:stretch:${now}:${(campaign.stretchGoals ?? []).length}`,
    campaignId: campaign.id,
    title: input.title.trim(),
    description: input.description?.trim(),
    targetAmount: input.targetAmount,
    windowStartsAt,
    windowEndsAt,
    rewards: input.rewards.map((r, i) => ({
      id: `${campaign.id}:stretch-reward:${now}:${i}`,
      title: r.title.trim(),
      description: r.description?.trim(),
    })),
    status: "pending",
    createdBy,
    createdAt: now,
  };

  const evaluated = evaluateStretchGoalStatus(goal, campaign, now);

  await dataSource.saveCampaign({
    ...campaign,
    stretchGoals: [...(campaign.stretchGoals ?? []), evaluated],
    updatedAt: now,
  });

  return evaluated;
}

export async function syncCampaignStretchGoals(
  campaignId: string,
  dataSource: CampaignDataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<StretchGoal[]> {
  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) throw new Error("Campaign not found");
  const next = (campaign.stretchGoals ?? []).map((g) =>
    evaluateStretchGoalStatus(g, campaign, now),
  );
  const changed = next.some((g, i) => g.status !== campaign.stretchGoals![i].status);
  if (changed) {
    await dataSource.saveCampaign({ ...campaign, stretchGoals: next, updatedAt: now });
  }
  return next;
}

export async function applyContributionAndUnlockStretchGoals(
  campaignId: string,
  amount: string,
  dataSource: CampaignDataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<{ campaign: CampaignRecord; unlocked: StretchGoal[] }> {
  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) throw new Error("Campaign not found");
  const nextRaised = (BigInt(campaign.raisedAmount || "0") + parseAmount(amount)).toString();
  const updated: CampaignRecord = {
    ...campaign,
    raisedAmount: nextRaised,
    updatedAt: now,
  };
  const previous = campaign.stretchGoals ?? [];
  const evaluated = previous.map((g) => evaluateStretchGoalStatus(g, updated, now));
  const unlocked = evaluated.filter(
    (g, i) => g.status === "unlocked" && previous[i].status !== "unlocked",
  );
  const saved = await dataSource.saveCampaign({
    ...updated,
    stretchGoals: evaluated,
  });
  return { campaign: saved, unlocked };
}
