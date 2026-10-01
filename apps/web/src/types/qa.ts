export type SpamSeverity = "none" | "low" | "medium" | "high" | "critical";

export type ModerationAction = "approve" | "flag" | "hide" | "delete";

export type QAItemStatus = "visible" | "flagged" | "hidden" | "deleted";

export interface SpamVerdict {
  score: number; // 0-100, higher = more likely spam
  severity: SpamSeverity;
  signals: SpamSignal[];
  action: ModerationAction;
}

export interface SpamSignal {
  name: string;
  weight: number;
  triggered: boolean;
  details?: string;
}

export interface QAItem {
  id: string;
  campaignId: string;
  authorAddress: string;
  authorName?: string;
  authorAvatarUrl?: string;
  isVerifiedBacker: boolean;
  content: string;
  createdAt: number; // Unix timestamp ms
  updatedAt?: number;
  status: QAItemStatus;
  spamVerdict?: SpamVerdict;
  replyToId?: string;
  upvotes: number;
}

export interface QAModerationResult {
  itemId: string;
  verdict: SpamVerdict;
  actionTaken: ModerationAction;
  timestamp: number;
}

export interface QAModerationStats {
  totalItems: number;
  visibleItems: number;
  flaggedItems: number;
  hiddenItems: number;
  avgSpamScore: number;
  topSpamSignals: { signal: string; count: number }[];
}

export interface CreateQAItemInput {
  campaignId: string;
  authorAddress: string;
  authorName?: string;
  content: string;
  replyToId?: string;
}

/** Mock data for initial rendering */
export const INITIAL_MOCK_QA_ITEMS: QAItem[] = [
  {
    id: "qa-1",
    campaignId: "camp-101",
    authorAddress: "GD6W...X892",
    authorName: "Satoshi Forestry Fund",
    isVerifiedBacker: true,
    content: "What percentage of funds goes directly to the indigenous communities managing the reserve?",
    createdAt: Date.now() - 3 * 86400000,
    status: "visible",
    upvotes: 12,
  },
  {
    id: "qa-2",
    campaignId: "camp-101",
    authorAddress: "GCRJ...4KLP",
    authorName: "Eco Investor DAO",
    isVerifiedBacker: true,
    content: "How will the satellite mapping data be shared with the public? Will there be a transparency dashboard?",
    createdAt: Date.now() - 2 * 86400000,
    status: "visible",
    upvotes: 8,
    replyToId: "qa-1",
  },
  {
    id: "qa-3",
    campaignId: "camp-101",
    authorAddress: "GBZT...9MNV",
    authorName: "SpamBot3000",
    isVerifiedBacker: false,
    content: "FREE XLM!!! Click here to claim your 10000 XLM reward now!!! bit.ly/scam-link",
    createdAt: Date.now() - 86400000,
    status: "hidden",
    spamVerdict: {
      score: 95,
      severity: "critical",
      signals: [
        { name: "excessive_caps", weight: 25, triggered: true, details: "61% uppercase characters" },
        { name: "url_shortener", weight: 30, triggered: true, details: "Contains bit.ly shortened URL" },
        { name: "financial_scam_keywords", weight: 30, triggered: true, details: "FREE XLM, claim reward" },
        { name: "excessive_punctuation", weight: 10, triggered: true, details: "Multiple exclamation marks" },
      ],
      action: "hide",
    },
    upvotes: 0,
  },
  {
    id: "qa-4",
    campaignId: "camp-101",
    authorAddress: "GDFR...7QRZ",
    authorName: "Community Member",
    isVerifiedBacker: false,
    content: "Is there a timeline for when the anti-poaching operations will begin?",
    createdAt: Date.now() - 86400000,
    status: "visible",
    upvotes: 5,
  },
];
