import type { CampaignDataSource, CampaignRecord } from "./campaign.service";
import { getCampaignDataSource } from "./campaign.service";

export interface RelatedCampaignsOptions {
  /** Desired minimum number of related campaigns to return (default: 4). */
  limit?: number;
  /** Whether to fallback to other active campaigns if fewer than limit are found (default: true). */
  allowFallback?: boolean;
}

export interface RelatedCampaignMatch {
  campaign: CampaignRecord;
  sharedTags: string[];
  sameCategory: boolean;
  score: number;
}

/**
 * Extracts all relevant tags and category for a campaign.
 */
export function getCampaignTags(campaign: CampaignRecord): string[] {
  const tags: string[] = [];
  if (campaign.category) {
    tags.push(campaign.category.trim().toLowerCase());
  }
  if (campaign.speciesTags && Array.isArray(campaign.speciesTags)) {
    tags.push(...campaign.speciesTags.map((t) => t.trim().toLowerCase()));
  }
  if (campaign.species) {
    tags.push(campaign.species.trim().toLowerCase());
  }
  if (campaign.treeSpecies) {
    tags.push(campaign.treeSpecies.trim().toLowerCase());
  }
  if (campaign.underrepresentedTags && Array.isArray(campaign.underrepresentedTags)) {
    tags.push(...campaign.underrepresentedTags.map((t) => t.trim().toLowerCase()));
  }
  return Array.from(new Set(tags.filter(Boolean)));
}

/**
 * Computes funding progress ratio (0 to 1+).
 */
export function getFundingProgress(campaign: CampaignRecord): number {
  try {
    const goal = BigInt(campaign.goalAmount || "0");
    const raised = BigInt(campaign.raisedAmount || "0");
    if (goal <= 0n) return 0;
    return Number((raised * 1000n) / goal) / 1000;
  } catch {
    return 0;
  }
}

/**
 * Determines whether a campaign is actively funding.
 * A campaign is actively funding if its status is "ACTIVE", or if not completed/failed/draft.
 */
export function isActivelyFunding(campaign: CampaignRecord): boolean {
  const status = (campaign.status || "").toUpperCase();
  if (status === "ACTIVE") {
    // If goal is reached or deadline passed, could still be active or transitioning, but status === ACTIVE is actively funding
    return true;
  }
  return false;
}

/**
 * Scores a candidate campaign relative to the target campaign.
 * Biases toward actively funding campaigns and higher funding progress/activity.
 */
export function scoreRelatedCampaign(
  target: CampaignRecord,
  candidate: CampaignRecord
): { score: number; sameCategory: boolean; sharedTags: string[] } {
  const targetCategory = (target.category || "").trim().toLowerCase();
  const candidateCategory = (candidate.category || "").trim().toLowerCase();
  const sameCategory = Boolean(targetCategory && candidateCategory && targetCategory === candidateCategory);

  const targetTags = getCampaignTags(target);
  const candidateTags = getCampaignTags(candidate);
  const sharedTags = candidateTags.filter((t) => targetTags.includes(t));

  let score = 0;

  // Category match contributes heavily
  if (sameCategory) {
    score += 50;
  }

  // Shared tags contribute per match
  score += sharedTags.length * 20;

  // Bias toward actively funding campaigns
  const active = isActivelyFunding(candidate);
  if (active) {
    score += 40;
  } else if (candidate.status === "COMPLETED") {
    score += 5;
  }

  // Activity & funding velocity bias: campaigns with progress and sponsors rank higher
  const progress = getFundingProgress(candidate);
  // Sweet spot for active funding: campaigns between 10% and 90% funded get a boost
  if (active && progress > 0 && progress < 1) {
    score += Math.min(progress * 20, 20);
  }

  if (candidate.sponsorCount > 0) {
    score += Math.min(candidate.sponsorCount * 2, 15);
  }

  // Recency bonus
  if (candidate.createdAt) {
    const ageInDays = (Date.now() - candidate.createdAt) / (1000 * 60 * 60 * 24);
    if (ageInDays < 30) {
      score += 5;
    }
  }

  return { score, sameCategory, sharedTags };
}

/**
 * Finds related campaigns for a given campaign.
 *
 * Acceptance Criteria:
 * - At least 4 related campaigns surfaced (when available in data source)
 * - Excludes the current campaign
 * - Algorithm biases toward actively funding campaigns
 * - Matches same category or shared tags
 */
export async function getRelatedCampaigns(
  campaignId: string,
  options: RelatedCampaignsOptions = {},
  dataSource: CampaignDataSource = getCampaignDataSource()
): Promise<CampaignRecord[]> {
  const limit = options.limit ?? 4;
  const allowFallback = options.allowFallback ?? true;

  const allCampaigns = await dataSource.getCampaigns();
  const target = allCampaigns.find((c) => c.id === campaignId);

  // Exclude current campaign
  const candidates = allCampaigns.filter((c) => c.id !== campaignId);

  if (!target) {
    // If target not found, return active campaigns up to limit
    return candidates
      .filter((c) => isActivelyFunding(c))
      .slice(0, limit);
  }

  const targetCategory = (target.category || "").trim().toLowerCase();
  const targetTags = getCampaignTags(target);

  // Evaluate each candidate
  const evaluated = candidates.map((candidate) => {
    const { score, sameCategory, sharedTags } = scoreRelatedCampaign(target, candidate);
    const hasCategoryMatch = sameCategory;
    const hasTagMatch = sharedTags.length > 0;
    const isDirectlyRelated = hasCategoryMatch || hasTagMatch;

    return {
      candidate,
      score,
      sameCategory,
      sharedTags,
      isDirectlyRelated,
      isActive: isActivelyFunding(candidate),
    };
  });

  // Filter to directly related first (same category or shared tags)
  const directlyRelated = evaluated
    .filter((e) => e.isDirectlyRelated)
    .sort((a, b) => {
      // Primary: higher score
      if (b.score !== a.score) return b.score - a.score;
      // Secondary: actively funding first
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      // Tertiary: sponsor count / raised
      return Number(b.candidate.sponsorCount || 0) - Number(a.candidate.sponsorCount || 0);
    });

  const results: CampaignRecord[] = directlyRelated.map((e) => e.candidate);

  // If fewer than limit (e.g. 4) and allowFallback is true, backfill with actively funding campaigns
  if (results.length < limit && allowFallback) {
    const includedIds = new Set(results.map((c) => c.id));
    const fallbackCandidates = evaluated
      .filter((e) => !includedIds.has(e.candidate.id))
      .sort((a, b) => {
        // Active campaigns first
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        // Higher score / progress
        if (b.score !== a.score) return b.score - a.score;
        return Number(b.candidate.raisedAmount || 0) - Number(a.candidate.raisedAmount || 0);
      });

    for (const item of fallbackCandidates) {
      if (results.length >= limit) break;
      results.push(item.candidate);
    }
  }

  return results.slice(0, Math.max(limit, results.length));
}
