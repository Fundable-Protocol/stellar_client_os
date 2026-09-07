/**
 * Types for Community Voting on Campaign Updates — Issue #784
 */

export interface PollOption {
  id: string;
  text: string;
  voteCount: number;
}

export type PollStatus = 'active' | 'closed' | 'extended';

export interface CampaignPoll {
  id: string;
  campaignId: string;
  updateId: string;
  title: string;
  description?: string;
  options: PollOption[];
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  status: PollStatus;
  backerOnly: boolean;
  totalVotes: number;
  winningOptionId?: string;
}

export interface PollVote {
  id: string;
  pollId: string;
  campaignId: string;
  voterAddress: string;
  optionId: string;
  votedAt: string;
  weight: number;
}

export interface CreatePollInput {
  campaignId: string;
  updateId: string;
  title: string;
  description?: string;
  options: string[];
  durationDays?: number;
  backerOnly?: boolean;
}

export interface CastVoteInput {
  pollId: string;
  campaignId: string;
  voterAddress: string;
  optionId: string;
}

export interface PollResultsSummary {
  pollId: string;
  campaignId: string;
  title: string;
  totalVotes: number;
  status: PollStatus;
  options: (PollOption & { percentage: number })[];
  winningOption?: PollOption;
}
