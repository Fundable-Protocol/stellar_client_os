import { FAQ_ITEMS, type FaqItem } from "@/components/modules/faq/faqData";
import type { CampaignFaqItem } from "./campaign.service";

export type ChatbotAnswerSource = "campaign_faq" | "platform_faq";

export interface ChatbotAnswerResult {
  answered: boolean;
  source?: ChatbotAnswerSource;
  answer?: string;
  matchedQuestion?: string;
  canEscalate: boolean;
  faqItem?: FaqItem | CampaignFaqItem;
}

export interface CampaignChatbotContext {
  id: string;
  name?: string;
  creator?: string;
  creatorEmail?: string;
  faqs?: CampaignFaqItem[];
}

const STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "by", "can", "could", "did", "do",
  "does", "for", "from", "get", "has", "have", "how", "i", "if", "in", "is", "it", "my",
  "of", "on", "or", "our", "the", "there", "this", "to", "was", "we", "what", "when",
  "where", "which", "who", "why", "will", "with", "would", "you", "your",
]);

/**
 * Normalizes text and returns meaningful search tokens.
 */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

/**
 * Calculates a match score between a user query and a FAQ candidate.
 * Looks at question keyword overlap, question substring containment,
 * and answer keyword overlap.
 */
export function calculateMatchScore(
  query: string,
  faqQuestion: string,
  faqAnswer: string,
): number {
  const normQuery = query.toLowerCase().trim();
  const normQ = faqQuestion.toLowerCase().trim();

  if (!normQuery) return 0;

  // Exact or direct phrase match in question gets maximum score
  if (normQ === normQuery) return 1.0;
  if (normQ.includes(normQuery) || normQuery.includes(normQ)) return 0.95;

  const queryKeywords = extractKeywords(normQuery);
  if (queryKeywords.length === 0) {
    // If only stop words, fallback to word check
    const simpleTokens = normQuery.split(/\s+/).filter(Boolean);
    const matches = simpleTokens.filter((t) => normQ.includes(t));
    return matches.length > 0 ? matches.length / simpleTokens.length : 0;
  }

  const qKeywords = extractKeywords(normQ);
  const qKeywordSet = new Set(qKeywords);

  let questionMatches = 0;
  for (const token of queryKeywords) {
    if (qKeywordSet.has(token) || qKeywords.some((qk) => qk.includes(token) || token.includes(qk))) {
      questionMatches++;
    }
  }

  const questionOverlap = questionMatches / queryKeywords.length;

  // Secondary check on answer keywords
  const answerKeywords = extractKeywords(faqAnswer);
  const aKeywordSet = new Set(answerKeywords);
  let answerMatches = 0;
  for (const token of queryKeywords) {
    if (aKeywordSet.has(token)) {
      answerMatches++;
    }
  }
  const answerOverlap = answerMatches / queryKeywords.length;

  return questionOverlap * 0.7 + answerOverlap * 0.3;
}

/**
 * Answers a backer query by:
 * 1. Searching campaign-specific FAQ section first
 * 2. Searching platform FAQ second
 * 3. Marking as unanswered and eligible for creator inbox escalation if neither matches
 */
export function answerCampaignQuestion(
  query: string,
  campaign: CampaignChatbotContext,
  platformFaqs: FaqItem[] = FAQ_ITEMS,
): ChatbotAnswerResult {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return {
      answered: false,
      canEscalate: false,
    };
  }

  const campaignFaqs = campaign.faqs ?? [];

  // Step 1: Search campaign FAQ section first
  let bestCampaignMatch: { item: CampaignFaqItem; score: number } | null = null;
  for (const item of campaignFaqs) {
    const score = calculateMatchScore(cleanQuery, item.question, item.answer);
    if (score >= 0.3 && (!bestCampaignMatch || score > bestCampaignMatch.score)) {
      bestCampaignMatch = { item, score };
    }
  }

  if (bestCampaignMatch) {
    return {
      answered: true,
      source: "campaign_faq",
      answer: bestCampaignMatch.item.answer,
      matchedQuestion: bestCampaignMatch.item.question,
      canEscalate: false,
      faqItem: bestCampaignMatch.item,
    };
  }

  // Step 2: Search platform FAQ section
  let bestPlatformMatch: { item: FaqItem; score: number } | null = null;
  for (const item of platformFaqs) {
    const score = calculateMatchScore(cleanQuery, item.question, item.answer);
    if (score >= 0.3 && (!bestPlatformMatch || score > bestPlatformMatch.score)) {
      bestPlatformMatch = { item, score };
    }
  }

  if (bestPlatformMatch) {
    return {
      answered: true,
      source: "platform_faq",
      answer: bestPlatformMatch.item.answer,
      matchedQuestion: bestPlatformMatch.item.question,
      canEscalate: false,
      faqItem: bestPlatformMatch.item,
    };
  }

  // Step 3: Question unanswered -> escalate to creator inbox
  return {
    answered: false,
    canEscalate: true,
  };
}

/**
 * Returns suggested starter questions for backer convenience.
 * Campaign questions are listed first, followed by top platform questions.
 */
export function getSuggestedQuestions(
  campaign: CampaignChatbotContext,
  platformFaqs: FaqItem[] = FAQ_ITEMS,
  maxTotal = 4,
): string[] {
  const suggested: string[] = [];

  if (campaign.faqs && campaign.faqs.length > 0) {
    for (const faq of campaign.faqs) {
      if (suggested.length >= maxTotal) break;
      suggested.push(faq.question);
    }
  }

  for (const faq of platformFaqs) {
    if (suggested.length >= maxTotal) break;
    if (!suggested.includes(faq.question)) {
      suggested.push(faq.question);
    }
  }

  return suggested;
}
