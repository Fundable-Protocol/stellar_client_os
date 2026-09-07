/**
 * Campaign Voting Service — Issue #784
 *
 * Enables campaign creators to post polls attached to campaign updates,
 * allowing verified backers to vote on key decisions transparently.
 */

import {
  CampaignPoll,
  CastVoteInput,
  CreatePollInput,
  PollOption,
  PollResultsSummary,
  PollVote,
} from '@/types/campaign-voting';

export class CampaignVotingService {
  private polls: Map<string, CampaignPoll> = new Map();
  private votes: Map<string, PollVote[]> = new Map();

  /**
   * Create a new poll attached to a campaign update.
   */
  public async createPoll(input: CreatePollInput, creatorAddress: string): Promise<CampaignPoll> {
    if (!input.title || !input.options || input.options.length < 2) {
      throw new Error('A poll must have a title and at least 2 voting options.');
    }

    const durationDays = input.durationDays ?? 7;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    const pollOptions: PollOption[] = input.options.map((optText, index) => ({
      id: `opt-${index + 1}-${Date.now().toString(36)}`,
      text: optText,
      voteCount: 0,
    }));

    const pollId = `poll-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const newPoll: CampaignPoll = {
      id: pollId,
      campaignId: input.campaignId,
      updateId: input.updateId,
      title: input.title,
      description: input.description,
      options: pollOptions,
      createdBy: creatorAddress,
      createdAt: now.toISOString(),
      expiresAt,
      status: 'active',
      backerOnly: input.backerOnly ?? true,
      totalVotes: 0,
    };

    this.polls.set(pollId, newPoll);
    this.votes.set(pollId, []);

    return newPoll;
  }

  /**
   * Cast a vote on a poll option.
   */
  public async castVote(input: CastVoteInput): Promise<PollVote> {
    const poll = this.polls.get(input.pollId);
    if (!poll) {
      throw new Error(`Poll with ID ${input.pollId} not found.`);
    }

    if (poll.status !== 'active' || new Date(poll.expiresAt) < new Date()) {
      throw new Error('This poll is closed or expired.');
    }

    const option = poll.options.find((opt) => opt.id === input.optionId);
    if (!option) {
      throw new Error(`Invalid option ID ${input.optionId} for poll ${input.pollId}.`);
    }

    const existingVotes = this.votes.get(input.pollId) || [];
    const alreadyVoted = existingVotes.some(
      (v) => v.voterAddress.toLowerCase() === input.voterAddress.toLowerCase()
    );

    if (alreadyVoted) {
      throw new Error(`Voter ${input.voterAddress} has already cast a vote in this poll.`);
    }

    const vote: PollVote = {
      id: `vote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      pollId: input.pollId,
      campaignId: input.campaignId,
      voterAddress: input.voterAddress,
      optionId: input.optionId,
      votedAt: new Date().toISOString(),
      weight: 1,
    };

    option.voteCount += 1;
    poll.totalVotes += 1;
    existingVotes.push(vote);
    this.votes.set(input.pollId, existingVotes);

    return vote;
  }

  /**
   * Get all polls for a specific campaign.
   */
  public async getPollsForCampaign(campaignId: string): Promise<CampaignPoll[]> {
    return Array.from(this.polls.values()).filter((p) => p.campaignId === campaignId);
  }

  /**
   * Get poll details by ID.
   */
  public async getPollById(pollId: string): Promise<CampaignPoll | null> {
    return this.polls.get(pollId) || null;
  }

  /**
   * Close a poll and finalize the winning option.
   */
  public async closePoll(pollId: string, creatorAddress: string): Promise<CampaignPoll> {
    const poll = this.polls.get(pollId);
    if (!poll) {
      throw new Error(`Poll with ID ${pollId} not found.`);
    }

    if (poll.createdBy.toLowerCase() !== creatorAddress.toLowerCase()) {
      throw new Error('Only the creator of the poll can manually close it.');
    }

    poll.status = 'closed';

    let maxVotes = -1;
    let winner: PollOption | undefined;
    for (const opt of poll.options) {
      if (opt.voteCount > maxVotes) {
        maxVotes = opt.voteCount;
        winner = opt;
      }
    }

    if (winner && maxVotes > 0) {
      poll.winningOptionId = winner.id;
    }

    return poll;
  }

  /**
   * Get detailed results and breakdown for a poll.
   */
  public async getPollResults(pollId: string): Promise<PollResultsSummary> {
    const poll = await this.getPollById(pollId);
    if (!poll) {
      throw new Error(`Poll with ID ${pollId} not found.`);
    }

    const totalVotes = poll.totalVotes;
    const optionsWithPct = poll.options.map((opt) => ({
      ...opt,
      percentage: totalVotes > 0 ? Number(((opt.voteCount / totalVotes) * 100).toFixed(2)) : 0,
    }));

    const winningOption = poll.winningOptionId
      ? poll.options.find((o) => o.id === poll.winningOptionId)
      : undefined;

    return {
      pollId: poll.id,
      campaignId: poll.campaignId,
      title: poll.title,
      totalVotes,
      status: poll.status,
      options: optionsWithPct,
      winningOption,
    };
  }
}

export const campaignVotingService = new CampaignVotingService();
