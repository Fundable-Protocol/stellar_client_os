/**
 * Types for AI Fraud Prevention & Suspicious Pattern Detection — Issue #796
 */

export type FraudPatternType =
  | 'UNREALISTIC_TREE_COUNT'
  | 'SUSPICIOUS_VERIFICATION'
  | 'BOT_SPONSORS'
  | 'LOCATION_MISMATCH'
  | 'FAKE_BACKERS'
  | 'DUPLICATE_ACCOUNTS'
  | 'MONEY_LAUNDERING'
  | 'RAPID_CIRCULAR_TRANSACTIONS'
  | 'IP_CLUSTERING'
  | 'UNREALISTIC_TREE_COUNT'
  | 'VERIFICATION_ANOMALY'
  | 'BOT_SPONSOR'
  | 'LOCATION_MISMATCH';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SuspiciousActivityFlag {
  id: string;
  patternType: FraudPatternType;
  description: string;
  severityScore: number; // 0-100
  evidenceDetails: Record<string, unknown>;
  detectedAt: string;
}

export interface FraudDetectionReport {
  campaignId: string;
  overallRiskScore: number; // 0 - 100
  riskLevel: RiskLevel;
  flags: SuspiciousActivityFlag[];
  isSuspended: boolean;
  analyzedBackerCount: number;
  analyzedTxCount: number;
  scannedAt: string;
  recommendation: 'PASS' | 'REVIEW' | 'AUTO_SUSPEND';
}

export interface BackerProfileSample {
  backerAddress: string;
  ipAddress?: string;
  pledgeAmount: number;
  pledgedAt: string;
  accountAgeDays?: number;
  userAgent?: string;
  verificationStatus?: 'verified' | 'pending' | 'failed';
  location?: string;
}

export interface VerificationSample {
  verifiedAt?: string;
  verifierId?: string;
  status: 'verified' | 'rejected' | 'pending';
  treeCount?: number;
  evidenceId?: string;
}

export interface AnalyzeCampaignInput {
  campaignId: string;
  campaignTitle?: string;
  creatorAddress?: string;
  location?: string;
  treeCount?: number;
  targetTrees?: number;
  campaignDurationDays?: number;
  verifications?: VerificationSample[];
  backers?: BackerProfileSample[];
  transactions?: {
    txHash: string;
    from: string;
    to: string;
    amount: number;
    timestamp: number;
  }[];
  campaignSnapshot?: { treeCount?: number; goalAmount?: number; raisedAmount?: number; location?: string; createdAt?: string; deadline?: string };
  plantingBatches?: Array<{ treeCount: number; plantedAt: string; verifiedAt?: string; planterAddress?: string; verifierAddress?: string; evidenceHash?: string; latitude?: number; longitude?: number }>;
  verificationEvents?: Array<{ planterAddress?: string; verifierAddress?: string; submittedAt: string; verifiedAt?: string; evidenceHash?: string }>;
  submittedLocation?: { latitude: number; longitude: number };
}

export interface CampaignSecurityStatus {
  campaignId: string;
  status: 'ACTIVE' | 'FLAGGED' | 'SUSPENDED';
  suspendedAt?: string;
  reason?: string;
}

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ManualReviewItem {
  id: string;
  campaignId: string;
  campaignTitle: string;
  creatorAddress?: string;
  flaggedAt: string;
  riskScore: number;
  riskLevel: RiskLevel;
  flags: SuspiciousActivityFlag[];
  status: ReviewStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  submittedAt: string;
}

export interface ManualReviewQueueFilter {
  status?: ReviewStatus;
  riskLevel?: RiskLevel;
  minRiskScore?: number;
}

export interface ReviewCampaignDecisionInput {
  decision: 'APPROVE' | 'REJECT';
  reviewedBy: string;
  notes?: string;
}

export interface ModelMetrics {
  totalEvaluations: number;
  flaggedCount: number;
  approvedCount: number; // false positives (flagged by model but approved by human reviewer)
  rejectedCount: number; // true positives (flagged by model and confirmed fraudulent)
  falsePositiveRate: number; // approvedCount / flaggedCount (or 0 if flaggedCount === 0)
  lastRetrainedAt: string;
  nextScheduledRetrainingAt: string;
  version: string;
}

export interface RetrainingLog {
  id: string;
  retrainedAt: string;
  triggeredBy: string; // 'QUARTERLY_SCHEDULE' | 'MANUAL'
  previousVersion: string;
  newVersion: string;
  falsePositiveRateBefore: number;
  trainingSamplesCount: number;
  notes?: string;
}
