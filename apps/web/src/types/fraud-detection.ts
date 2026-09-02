/**
 * Types for AI Fraud Prevention & Suspicious Pattern Detection — Issue #796
 */

export type FraudPatternType =
  | 'FAKE_BACKERS'
  | 'DUPLICATE_ACCOUNTS'
  | 'MONEY_LAUNDERING'
  | 'RAPID_CIRCULAR_TRANSACTIONS'
  | 'IP_CLUSTERING';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SuspiciousActivityFlag {
  id: string;
  patternType: FraudPatternType;
  description: string;
  severityScore: number; // 0-100
  evidenceDetails: Record<string, any>;
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
}

export interface AnalyzeCampaignInput {
  campaignId: string;
  campaignTitle?: string;
  creatorAddress?: string;
  backers?: BackerProfileSample[];
  transactions?: {
    txHash: string;
    from: string;
    to: string;
    amount: number;
    timestamp: number;
  }[];
}

export interface CampaignSecurityStatus {
  campaignId: string;
  status: 'ACTIVE' | 'FLAGGED' | 'SUSPENDED';
  suspendedAt?: string;
  reason?: string;
}
