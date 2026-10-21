/**
 * Types for Milestone-Based Fund Release Tied to Backer Approval Vote
 *
 * Feature Request:
 * After a campaign closes, release funds in tranches tied to milestones,
 * with backers voting to approve each milestone before the next tranche is released.
 *
 * Acceptance Criteria:
 * 1. Creator submits milestone completion report
 * 2. Backers receive vote notification and have 72 hours to vote
 * 3. Release triggered if majority approves or timeout lapses
 */

export type MilestoneTrancheStatus =
  | 'PENDING'
  | 'VOTING'
  | 'APPROVED'
  | 'REJECTED'
  | 'RELEASED';

export type MilestoneReleaseReason = 'majority_approval' | 'timeout_lapsed';

export interface MilestoneCompletionReport {
  reportId: string;
  milestoneId: string;
  campaignId: string;
  submittedBy: string;
  submittedAt: number;
  summary: string;
  evidenceUrls?: string[];
  deliverables?: string;
}

export interface BackerMilestoneVote {
  id: string;
  campaignId: string;
  milestoneId: string;
  voterAddress: string;
  approve: boolean;
  votedAt: number;
  comment?: string;
}

export interface MilestoneTranche {
  id: string;
  campaignId: string;
  milestoneNumber: number;
  title: string;
  description: string;
  tranchePercentage: number;
  targetAmount: string;
  status: MilestoneTrancheStatus;
  completionReport?: MilestoneCompletionReport;
  votingStartedAt?: number;
  votingEndsAt?: number;
  votesFor: number;
  votesAgainst: number;
  totalBackersVoted: number;
  releasedAt?: number;
  releasedAmount?: string;
  releasedTxHash?: string;
  releaseReason?: MilestoneReleaseReason;
}

export interface TrancheConfigInput {
  title: string;
  description: string;
  tranchePercentage: number;
  targetAmount?: string;
}

export interface InitializeTranchesInput {
  campaignId: string;
  totalAmount?: string;
  tranches?: TrancheConfigInput[];
}

export interface SubmitCompletionReportInput {
  campaignId: string;
  milestoneId: string;
  creatorAddress: string;
  summary: string;
  evidenceUrls?: string[];
  deliverables?: string;
}

export interface CastMilestoneVoteInput {
  campaignId: string;
  milestoneId: string;
  voterAddress: string;
  approve: boolean;
  comment?: string;
}

export interface TriggerMilestoneReleaseInput {
  campaignId: string;
  milestoneId: string;
  callerAddress?: string;
}

export interface MilestoneReleaseVotingSummary {
  milestoneId: string;
  campaignId: string;
  milestoneNumber: number;
  title: string;
  status: MilestoneTrancheStatus;
  votingStartedAt?: number;
  votingEndsAt?: number;
  timeRemainingMs: number;
  isTimeoutLapsed: boolean;
  votesFor: number;
  votesAgainst: number;
  totalVotes: number;
  totalEligibleBackers: number;
  approvalPercentage: number;
  isMajorityApproved: boolean;
  canRelease: boolean;
  releaseReason?: MilestoneReleaseReason;
}
