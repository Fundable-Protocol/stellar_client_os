import { getCampaign, getCampaignDataSource } from "./campaign.service";

export interface CampaignFeedbackInput {
  sponsorAddress: string;
  comment: string;
  rating?: number;
}

export interface CampaignSentiment {
  campaignId: string;
  feedbackCount: number;
  averageSentiment: number;
  satisfactionPercent: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  needsOutreach: boolean;
  updatedAt: number;
}

interface StoredFeedback {
  sponsorAddress: string;
  score: number;
}

const positiveWords = new Set([
  "amazing", "awesome", "best", "care", "delivered", "excellent", "fantastic", "good", "great",
  "happy", "helpful", "impressed", "love", "perfect", "successful", "thank", "transparent", "wonderful",
]);
const negativeWords = new Set([
  "bad", "broken", "cancelled", "canceled", "concern", "disappointed", "failure", "frustrated",
  "late", "misleading", "missing", "poor", "problem", "refund", "scam", "slow", "terrible", "unhappy",
  "unresponsive", "worse", "worst",
]);
const negations = new Set(["no", "not", "never", "without", "isn't", "wasn't", "didn't", "can't", "couldn't"]);
const intensifiers = new Set(["very", "really", "extremely", "so", "incredibly"]);
const MIN_FEEDBACK_FOR_OUTREACH = 3;
const LOW_SENTIMENT_THRESHOLD = -0.25;

const feedbackByCampaign = new Map<string, StoredFeedback[]>();

function scoreComment(comment: string): number {
  const tokens = comment.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  let score = 0;
  let matchedWords = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const direction = positiveWords.has(token) ? 1 : negativeWords.has(token) ? -1 : 0;
    if (direction === 0) continue;

    const preceding = tokens.slice(Math.max(0, index - 3), index);
    const negated = preceding.some((word) => negations.has(word));
    const intensified = preceding.some((word) => intensifiers.has(word));
    score += direction * (negated ? -1 : 1) * (intensified ? 1.5 : 1);
    matchedWords += 1;
  }

  return matchedWords === 0 ? 0 : Math.max(-1, Math.min(1, score / matchedWords));
}

export function analyzeCampaignFeedback(input: CampaignFeedbackInput): number {
  const textScore = scoreComment(input.comment);
  if (input.rating === undefined) return textScore;
  const ratingScore = (input.rating - 3) / 2;
  return Math.round((textScore * 0.4 + ratingScore * 0.6) * 100) / 100;
}

export async function recordCampaignFeedback(
  campaignId: string,
  input: CampaignFeedbackInput,
  dataSource = getCampaignDataSource(),
): Promise<CampaignSentiment> {
  if (!(await getCampaign(campaignId, dataSource))) throw new Error("Campaign not found");
  if (!input.sponsorAddress?.trim()) throw new Error("sponsorAddress is required");
  if (!input.comment?.trim()) throw new Error("comment is required");
  if (input.comment.trim().length > 2000) throw new Error("comment must be 2000 characters or fewer");
  if (input.rating !== undefined && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
    throw new Error("rating must be an integer from 1 to 5");
  }

  const feedback = feedbackByCampaign.get(campaignId) ?? [];
  const sponsorAddress = input.sponsorAddress.trim().toLowerCase();
  const existingIndex = feedback.findIndex((item) => item.sponsorAddress === sponsorAddress);
  const entry = { sponsorAddress, score: analyzeCampaignFeedback(input) };
  if (existingIndex >= 0) feedback[existingIndex] = entry;
  else feedback.push(entry);
  feedbackByCampaign.set(campaignId, feedback);
  const sentiment = await getCampaignSentiment(campaignId, dataSource);
  if (!sentiment) throw new Error("Campaign not found");
  return sentiment;
}

export async function getCampaignSentiment(
  campaignId: string,
  dataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<CampaignSentiment | null> {
  if (!(await getCampaign(campaignId, dataSource))) return null;
  const feedback = feedbackByCampaign.get(campaignId) ?? [];
  const average = feedback.length
    ? feedback.reduce((sum, item) => sum + item.score, 0) / feedback.length
    : 0;
  const positiveCount = feedback.filter((item) => item.score > 0.1).length;
  const negativeCount = feedback.filter((item) => item.score < -0.1).length;

  return {
    campaignId,
    feedbackCount: feedback.length,
    averageSentiment: Math.round(average * 100) / 100,
    satisfactionPercent: Math.round(((average + 1) / 2) * 100),
    positiveCount,
    neutralCount: feedback.length - positiveCount - negativeCount,
    negativeCount,
    needsOutreach: feedback.length >= MIN_FEEDBACK_FOR_OUTREACH && average <= LOW_SENTIMENT_THRESHOLD,
    updatedAt: now,
  };
}

export function clearCampaignSentiment(campaignId: string): void {
  feedbackByCampaign.delete(campaignId);
}