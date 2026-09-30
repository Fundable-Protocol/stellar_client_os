/**
 * Lexicon-based sentiment analysis for sponsor comments (#949).
 *
 * Dependency-free NLP-lite: tokenizes text, scores it against a curated
 * positive/negative word list with negation ("not good") and intensifier
 * ("very good") handling. Good enough to gauge satisfaction and flag
 * low-sentiment campaigns for creator outreach; swap for a hosted NLP
 * provider later behind the same interface.
 */

// ── Lexicon ───────────────────────────────────────────────────────────────────

/** Words worth ±2 before clipping. */
const STRONG_POSITIVE = new Set([
  "amazing", "awesome", "excellent", "fantastic", "incredible", "love", "loved",
  "perfect", "outstanding", "superb", "wonderful", "brilliant", "impressed",
]);

const POSITIVE = new Set([
  "good", "great", "happy", "glad", "nice", "beautiful", "clean", "fast",
  "helpful", "friendly", "supportive", "responsive", "transparent", "reliable",
  "impressive", "proud", "gladly", "enjoy", "enjoyed", "recommend", "thanks",
  "thank", "grateful", "excited", "pleased", "delighted", "smooth", "trust",
  "trustworthy", "impactful", "meaningful", "inspiring", "progress", "growth",
  "healthy", "thriving", "flourishing", "bloom", "blooming", "success",
  "successful", "worth", "worthwhile", "legacy", "hope", "hopeful",
]);

const STRONG_NEGATIVE = new Set([
  "awful", "horrible", "terrible", "appalling", "disgusting", "hate", "hated",
  "disaster", "scam", "fraud", "worthless", "unacceptable", "outraged",
]);

const NEGATIVE = new Set([
  "bad", "poor", "sad", "disappointed", "disappointing", "slow", "broken",
  "buggy", "rude", "unhelpful", "unresponsive", "vague", "confusing", "stuck",
  "delayed", "delay", "late", "stalled", "stall", "failed", "fail", "failure",
  "problem", "problems", "issue", "issues", "error", "errors", "concern",
  "concerns", "worried", "worry", "worrying", "suspicious", "doubt", "doubts",
  "doubtful", "frustrated", "frustrating", "annoyed", "annoying", "angry",
  "upset", "unhappy", "missing", "ignored", "ghosted", "silence", "stagnant",
  "declining", "dying", "dead", "waste", "wasted", "regret", "regretted",
  "unfortunately", "avoid", "caution", "warning", "beware", "overdue",
  "unclear", "unanswered", "complaint", "complaints", "refund", "refunds",
]);

/** Negators flip the polarity of the next scored word and halve it. */
const NEGATORS = new Set([
  "not", "no", "never", "nothing", "neither", "nor", "hardly", "barely",
  "scarcely", "without", "isn't", "wasn't", "aren't", "weren't", "don't",
  "doesn't", "didn't", "won't", "wouldn't", "can't", "cannot", "couldn't",
  "shouldn't", "ain't", "lacks", "lacking", "lack",
]);

/** Intensifiers multiply the next scored word's weight. */
const INTENSIFIERS = new Map<string, number>([
  ["very", 1.5],
  ["really", 1.5],
  ["extremely", 2],
  ["incredibly", 2],
  ["absolutely", 2],
  ["totally", 1.5],
  ["so", 1.25],
  ["highly", 1.5],
  ["deeply", 1.75],
  ["super", 1.5],
]);

/** Downtoners shrink the next scored word's weight. */
const DOWNTONERS = new Map<string, number>([
  ["slightly", 0.5],
  ["somewhat", 0.6],
  ["barely", 0.4],
  ["kinda", 0.7],
  ["mildly", 0.6],
  ["rather", 0.75],
]);

// ── Core ──────────────────────────────────────────────────────────────────────

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Score a single text in the range [-1, 1]:
 * sum of word scores (with negation/intensifier modifiers) divided by
 * `2 * sqrt(scored word count)` — a length-normalized saturation curve.
 */
export function analyzeSentiment(text: string): number {
  const tokens = tokenize(text);
  let sum = 0;
  let count = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let weight = 0;

    if (STRONG_POSITIVE.has(token)) weight = 2;
    else if (POSITIVE.has(token)) weight = 1;
    else if (STRONG_NEGATIVE.has(token)) weight = -2;
    else if (NEGATIVE.has(token)) weight = -1;
    else continue;

    // Look back one token for negation / intensifier / downtoner.
    const prev = i > 0 ? tokens[i - 1] : undefined;
    if (prev && NEGATORS.has(prev)) {
      weight = -weight * 0.5;
    } else if (prev && INTENSIFIERS.has(prev)) {
      weight *= INTENSIFIERS.get(prev)!;
    } else if (prev && DOWNTONERS.has(prev)) {
      weight *= DOWNTONERS.get(prev)!;
    }

    sum += weight;
    count++;
  }

  if (count === 0) return 0;
  return Math.max(-1, Math.min(1, sum / (2 * Math.sqrt(count))));
}

export type SentimentLabel = "positive" | "neutral" | "negative";

export function labelSentiment(score: number): SentimentLabel {
  if (score >= 0.15) return "positive";
  if (score <= -0.15) return "negative";
  return "neutral";
}

// ── Campaign aggregation ──────────────────────────────────────────────────────

export interface SponsorFeedback {
  /** Arbitrary id (comment id, testimonial index, …). */
  id: string;
  comment: string;
  /** Optional 1–5 star rating to blend with the text score. */
  rating?: number;
}

export interface CommentSentiment {
  id: string;
  score: number;
  label: SentimentLabel;
  rating?: number;
}

export interface CampaignSentiment {
  campaignId: string;
  /** Mean of per-comment scores in [-1, 1]; null when no comments exist. */
  averageScore: number | null;
  label: SentimentLabel | "no-data";
  counts: { positive: number; neutral: number; negative: number };
  total: number;
  /** Low-sentiment flag for creator outreach (see LOW_SENTIMENT_THRESHOLD). */
  needsOutreach: boolean;
  comments: CommentSentiment[];
}

/**
 * A campaign is flagged when its average score drops below this and it has
 * at least `MIN_COMMENTS_FOR_OUTREACH` comments (avoid flagging on one bad
 * comment).
 */
export const LOW_SENTIMENT_THRESHOLD = -0.1;
export const MIN_COMMENTS_FOR_OUTREACH = 3;

export function analyzeCampaignSentiment(
  campaignId: string,
  feedback: SponsorFeedback[],
): CampaignSentiment {
  const comments: CommentSentiment[] = feedback.map((item) => {
    const textScore = analyzeSentiment(item.comment);

    // Blend: 80% text, 20% rating (when a 1–5 rating exists, normalized to [-1, 1]).
    const score =
      typeof item.rating === "number" && item.rating >= 1 && item.rating <= 5
        ? 0.8 * textScore + 0.2 * ((item.rating - 3) / 2)
        : textScore;

    return { id: item.id, score, label: labelSentiment(score), rating: item.rating };
  });

  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const c of comments) counts[c.label]++;

  const total = comments.length;
  const averageScore =
    total === 0 ? null : comments.reduce((acc, c) => acc + c.score, 0) / total;

  const label: CampaignSentiment["label"] =
    averageScore === null ? "no-data" : labelSentiment(averageScore);

  const needsOutreach =
    averageScore !== null &&
    total >= MIN_COMMENTS_FOR_OUTREACH &&
    averageScore < LOW_SENTIMENT_THRESHOLD;

  return {
    campaignId,
    averageScore,
    label,
    counts,
    total,
    needsOutreach,
    comments,
  };
}
