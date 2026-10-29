/**
 * Yield Strategy Types for Milestone Escrow Funds
 */

export type YieldStrategyType = "blend_protocol" | "tokenized_tbill" | "money_market" | "none";

export type YieldStrategyStatus = "active" | "paused" | "emergency_withdrawn" | "disabled";

export interface YieldStrategy {
  id: string;
  name: string;
  type: YieldStrategyType;
  anchorDomain: string;
  contractAddress: string;
  assetCode: string;
  assetIssuer: string;
  estimatedAPY: number; // In basis points (e.g., 500 = 5%)
  minimumLockPeriod: number; // In days
  liquidityRisk: "low" | "medium" | "high";
  isVerified: boolean;
  isActive: boolean;
}

export interface CampaignYieldConfig {
  id: string;
  campaignId: string;
  enabled: boolean;
  strategyId: string;
  status: YieldStrategyStatus;
  totalDeposited: string;
  accruedYield: string;
  depositedAt?: number;
  lastYieldCheckAt?: number;
  emergencyWithdrawalReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface YieldDeposit {
  id: string;
  campaignId: string;
  milestoneId: string;
  amount: string;
  strategyId: string;
  depositedAt: number;
  releaseDate: number; // Milestone release timestamp
  accruedYield: string;
  yieldDistributed: boolean;
  withdrawnAt?: number;
}

export interface YieldTransaction {
  id: string;
  campaignId: string;
  type: "deposit" | "withdrawal" | "yield_accrual" | "emergency_withdrawal";
  amount: string;
  strategyId: string;
  txHash?: string;
  timestamp: number;
  status: "pending" | "completed" | "failed";
  errorMessage?: string;
}

export interface YieldDistributionRule {
  creatorShare: number; // In basis points (e.g., 8000 = 80%)
  backerShare: number; // In basis points (e.g., 2000 = 20%)
  platformFee: number; // In basis points (e.g., 0 = 0%)
}

export interface MilestoneEscrowYield {
  milestoneId: string;
  milestonePercentage: number;
  escrowAmount: string;
  releaseDate: number;
  daysPending: number;
  estimatedYield: string;
  actualYield: string;
  isReleased: boolean;
}

export interface LiquidityStressAlert {
  strategyId: string;
  strategyName: string;
  campaignId: string;
  severity: "warning" | "critical";
  message: string;
  recommendedAction: string;
  triggeredAt: number;
}
