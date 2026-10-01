import type {
  SpamVerdict,
  SpamSignal,
  SpamSeverity,
  ModerationAction,
} from "@/types/qa";

// ---------------------------------------------------------------------------
// Spam detection signals – each weights a different heuristic
// ---------------------------------------------------------------------------

const URL_SHORTENER_PATTERN =
  /bit\.ly|tinyurl\.com|goo\.gl|t\.co|is\.gd|buff\.ly|ow\.ly|cutt\.ly|shorturl\.at/i;

const PHISHING_KEYWORDS = [
  "free xlm",
  "claim your",
  "click here",
  "act now",
  "limited time",
  "congratulations",
  "you won",
  "verify your wallet",
  "send xlm to",
  "double your",
  "guaranteed returns",
  "risk-free",
  "no deposit required",
];

const SPAMMY_PHRASES = [
  "join now",
  "dm me",
  "whatsapp",
  "telegram group",
  "airdrop",
  "whitelist spot",
  "presale",
  "guaranteed profit",
  "100% daily",
  "passive income guaranteed",
];

/**
 * Evaluate a text string against all spam signals and produce a verdict.
 */
export function detectSpam(text: string, isVerifiedBacker: boolean): SpamVerdict {
  const signals: SpamSignal[] = [];

  // 1. Excessive uppercase
  const upperChars = (text.match(/[A-Z]/g) || []).length;
  const letterChars = (text.match(/[A-Za-z]/g) || []).length;
  const upperRatio = letterChars > 0 ? upperChars / letterChars : 0;
  signals.push({
    name: "excessive_caps",
    weight: 25,
    triggered: upperRatio > 0.4,
    details: `${Math.round(upperRatio * 100)}% uppercase characters`,
  });

  // 2. Excessive exclamation / question marks
  const exclamationCount = (text.match(/!/g) || []).length;
  signals.push({
    name: "excessive_punctuation",
    weight: 10,
    triggered: exclamationCount >= 3,
    details: `${exclamationCount} exclamation marks`,
  });

  // 3. URL shorteners
  signals.push({
    name: "url_shortener",
    weight: 30,
    triggered: URL_SHORTENER_PATTERN.test(text),
    details: "Contains shortened URL",
  });

  // 4. Phishing / financial scam keywords
  const lowerText = text.toLowerCase();
  const matchedKeywords = PHISHING_KEYWORDS.filter((kw) => lowerText.includes(kw));
  signals.push({
    name: "financial_scam_keywords",
    weight: 30,
    triggered: matchedKeywords.length > 0,
    details: matchedKeywords.length > 0 ? `Matched: ${matchedKeywords.join(", ")}` : undefined,
  });

  // 5. Spammy phrases
  const matchedPhrases = SPAMMY_PHRASES.filter((ph) => lowerText.includes(ph));
  signals.push({
    name: "spammy_phrases",
    weight: 20,
    triggered: matchedPhrases.length > 0,
    details: matchedPhrases.length > 0 ? `Matched: ${matchedPhrases.join(", ")}` : undefined,
  });

  // 6. Repetitive characters (e.g. "aaaaaa", "!!!!!!")
  const repetitivePattern = /(.)\1{5,}/;
  signals.push({
    name: "repetitive_characters",
    weight: 15,
    triggered: repetitivePattern.test(text),
    details: "Contains 6+ consecutive identical characters",
  });

  // 7. Very short content with links (common spam pattern)
  const hasUrl = /https?:\/\/|www\./i.test(text);
  signals.push({
    name: "short_content_with_link",
    weight: 20,
    triggered: hasUrl && text.length < 80,
    details: "Short message with embedded URL",
  });

  // 8. Non-verified backer penalty
  signals.push({
    name: "unverified_author",
    weight: 10,
    triggered: !isVerifiedBacker,
    details: "Author is not a verified backer",
  });

  // 9. ALL CAPS words (individual words)
  const words = text.split(/\s+/);
  const allCapsWords = words.filter((w) => /^[A-Z]{3,}$/.test(w) && !/^[A-Z]{1,2}$/.test(w));
  signals.push({
    name: "all_caps_words",
    weight: 10,
    triggered: allCapsWords.length >= 3,
    details: `${allCapsWords.length} ALL-CAPS words`,
  });

  // 10. Emoji spam
  const emojiCount = (text.match(/[\u{1F600}-\u{1F9FF}]/gu) || []).length;
  signals.push({
    name: "emoji_spam",
    weight: 10,
    triggered: emojiCount >= 5,
    details: `${emojiCount} emojis`,
  });

  // Calculate weighted score
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const triggeredWeight = signals
    .filter((s) => s.triggered)
    .reduce((sum, s) => sum + s.weight, 0);

  const score = Math.min(100, Math.round((triggeredWeight / totalWeight) * 100));
  const severity = scoreToSeverity(score);
  const action = scoreToAction(score);

  return { score, severity, signals, action };
}

function scoreToSeverity(score: number): SpamSeverity {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "none";
}

function scoreToAction(score: number): ModerationAction {
  if (score >= 80) return "hide";
  if (score >= 60) return "flag";
  if (score >= 40) return "flag";
  return "approve";
}

/**
 * Run moderation on a batch of Q&A items. Returns only items that need action.
 */
export function moderateBatch(
  items: { id: string; content: string; isVerifiedBacker: boolean }[],
): { id: string; verdict: SpamVerdict }[] {
  return items
    .map((item) => ({
      id: item.id,
      verdict: detectSpam(item.content, item.isVerifiedBacker),
    }))
    .filter((r) => r.verdict.action !== "approve");
}

/**
 * Get moderation statistics from a list of verdicts.
 */
export function computeModerationStats(
  verdicts: { action: ModerationAction; score: number }[],
): { flagged: number; hidden: number; avgScore: number } {
  if (verdicts.length === 0) return { flagged: 0, hidden: 0, avgScore: 0 };
  const flagged = verdicts.filter((v) => v.action === "flag").length;
  const hidden = verdicts.filter((v) => v.action === "hide").length;
  const avgScore = Math.round(verdicts.reduce((s, v) => s + v.score, 0) / verdicts.length);
  return { flagged, hidden, avgScore };
}
