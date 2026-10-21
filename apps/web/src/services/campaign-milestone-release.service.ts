/**
 * Campaign Milestone Fund Release Service
 *
 * Feature: After a campaign closes, release funds in tranches tied to milestones,
 * with backers voting to approve each milestone before the next tranche is released.
 *
 * Acceptance Criteria:
 * 1. Creator submits milestone completion report
 * 2. Backers receive vote notification and have 72 hours to vote
 * 3. Release triggered if majority approves or timeout lapses
 */

import {
  BackerMilestoneVote,
  CastMilestoneVoteInput,
  InitializeTranchesInput,
  MilestoneCompletionReport,
  MilestoneReleaseVotingSummary,
  MilestoneTranche,
  SubmitCompletionReportInput,
  TriggerMilestoneReleaseInput,
} from '@/types/campaign-milestone-release';
import { backersService } from './campaign-backers.service';
import { getCampaign, type CampaignRecord } from './campaign.service';
import { pushNotificationService } from './push-notification.service';

export const VOTING_WINDOW_HOURS = 72;
export const VOTING_WINDOW_MS = VOTING_WINDOW_HOURS * 60 * 60 * 1000; // 72 hours in ms

const sameAddress = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

export class CampaignMilestoneReleaseService {
  private tranches = new Map<string, MilestoneTranche[]>();
  private votes = new Map<string, BackerMilestoneVote[]>();

  private trancheKey(campaignId: string): string {
    return campaignId.trim();
  }

  private voteKey(campaignId: string, milestoneId: string): string {
    return `${campaignId.trim()}:${milestoneId.trim()}`;
  }

  /**
   * Reset in-memory state (useful for test isolation).
   */
  public reset(): void {
    this.tranches.clear();
    this.votes.clear();
  }

  /**
   * Determine if a campaign is closed and eligible for milestone releases.
   */
  public isCampaignClosed(status?: string): boolean {
    if (!status) return false;
    const normalized = status.toUpperCase();
    return (
      normalized === 'COMPLETED' ||
      normalized === 'FAILED' ||
      normalized === 'CLAIMED' ||
      normalized === 'CLOSED'
    );
  }

  /**
   * Initialize or retrieve tranches for a campaign.
   * If not already initialized, creates standard default tranches.
   */
  public initializeTranches(
    input: InitializeTranchesInput,
    now = Date.now()
  ): MilestoneTranche[] {
    const key = this.trancheKey(input.campaignId);
    const existing = this.tranches.get(key);
    if (existing && existing.length > 0) {
      return existing;
    }

    const totalAmount = input.totalAmount || '10000';
    let tranches: MilestoneTranche[] = [];

    if (input.tranches && input.tranches.length > 0) {
      tranches = input.tranches.map((t, idx) => {
        const pct = t.tranchePercentage;
        const targetAmount =
          t.targetAmount ||
          String(Math.floor((Number(totalAmount) * pct) / 100));
        return {
          id: `tranche-${input.campaignId}-${idx + 1}`,
          campaignId: input.campaignId,
          milestoneNumber: idx + 1,
          title: t.title,
          description: t.description,
          tranchePercentage: pct,
          targetAmount,
          status: 'PENDING',
          votesFor: 0,
          votesAgainst: 0,
          totalBackersVoted: 0,
        };
      });
    } else {
      // Default 3-tranche structure (30%, 30%, 40%)
      const t1Amount = String(Math.floor((Number(totalAmount) * 30) / 100));
      const t2Amount = String(Math.floor((Number(totalAmount) * 30) / 100));
      const t3Amount = String(
        Number(totalAmount) - Number(t1Amount) - Number(t2Amount)
      );

      tranches = [
        {
          id: `tranche-${input.campaignId}-1`,
          campaignId: input.campaignId,
          milestoneNumber: 1,
          title: 'Milestone 1: Project Kickoff & Site Preparation',
          description:
            'Initial nursery setup, soil testing, and local community outreach.',
          tranchePercentage: 30,
          targetAmount: t1Amount,
          status: 'PENDING',
          votesFor: 0,
          votesAgainst: 0,
          totalBackersVoted: 0,
        },
        {
          id: `tranche-${input.campaignId}-2`,
          campaignId: input.campaignId,
          milestoneNumber: 2,
          title: 'Milestone 2: Seedling Planting & Irrigation Deployment',
          description:
            'Planting of the primary batch of saplings and installing drip irrigation.',
          tranchePercentage: 30,
          targetAmount: t2Amount,
          status: 'PENDING',
          votesFor: 0,
          votesAgainst: 0,
          totalBackersVoted: 0,
        },
        {
          id: `tranche-${input.campaignId}-3`,
          campaignId: input.campaignId,
          milestoneNumber: 3,
          title: 'Milestone 3: Growth Verification & Ecological Audit',
          description:
            'GPS tagging of saplings, third-party verification, and drone aerial audit.',
          tranchePercentage: 40,
          targetAmount: t3Amount,
          status: 'PENDING',
          votesFor: 0,
          votesAgainst: 0,
          totalBackersVoted: 0,
        },
      ];
    }

    this.tranches.set(key, tranches);
    return tranches;
  }

  /**
   * Get all milestone tranches for a campaign.
   * Auto-evaluates timeout lapses for any active voting tranches.
   */
  public async getTranches(
    campaignId: string,
    now = Date.now(),
    campaignLookup?: () => CampaignRecord | null
  ): Promise<MilestoneTranche[]> {
    const key = this.trancheKey(campaignId);
    let list = this.tranches.get(key);

    if (!list || list.length === 0) {
      let totalAmount = '10000';
      if (campaignLookup) {
        const c = campaignLookup();
        if (c?.raisedAmount) totalAmount = c.raisedAmount;
      } else {
        const c = await getCampaign(campaignId);
        if (c?.raisedAmount) totalAmount = c.raisedAmount;
      }
      list = this.initializeTranches({ campaignId, totalAmount }, now);
    }

    // Auto-evaluate timeout lapses
    for (const tranche of list) {
      if (tranche.status === 'VOTING' && tranche.votingEndsAt && now >= tranche.votingEndsAt) {
        await this.evaluateAndTriggerRelease(
          { campaignId, milestoneId: tranche.id },
          now,
          campaignLookup
        );
      }
    }

    return [...(this.tranches.get(key) || [])].sort(
      (a, b) => a.milestoneNumber - b.milestoneNumber
    );
  }

  /**
   * Get a specific milestone tranche by ID.
   */
  public async getTrancheById(
    campaignId: string,
    milestoneId: string,
    now = Date.now(),
    campaignLookup?: () => CampaignRecord | null
  ): Promise<MilestoneTranche | null> {
    const list = await this.getTranches(campaignId, now, campaignLookup);
    return list.find((t) => t.id === milestoneId) || null;
  }

  /**
   * Acceptance Criteria 1: Creator submits milestone completion report.
   * - Enforces campaign is closed.
   * - Enforces creator authorization.
   * - Enforces sequential milestone progress (prior milestone must be RELEASED).
   * - Dispatches vote notifications to backers and opens 72-hour voting window.
   */
  public async submitCompletionReport(
    input: SubmitCompletionReportInput,
    now = Date.now(),
    campaignLookup?: () => CampaignRecord | null
  ): Promise<MilestoneTranche> {
    const campaignId = input.campaignId.trim();
    const milestoneId = input.milestoneId.trim();
    const creatorAddress = input.creatorAddress.trim();

    if (!input.summary || input.summary.trim().length === 0) {
      throw new Error('Milestone completion report summary is required.');
    }

    const campaign = campaignLookup
      ? campaignLookup()
      : await getCampaign(campaignId);

    const registeredCreator = backersService.getCampaignCreator(campaignId);
    const expectedCreator = campaign?.creator || registeredCreator;

    if (expectedCreator && !sameAddress(expectedCreator, creatorAddress)) {
      throw new Error(
        'Unauthorized: Only the campaign creator can submit a milestone completion report.'
      );
    }

    if (campaign && !this.isCampaignClosed(campaign.status)) {
      throw new Error(
        'Campaign is not closed. Milestone fund release opens only after the campaign closes.'
      );
    }

    const tranches = await this.getTranches(campaignId, now, campaignLookup);
    const trancheIndex = tranches.findIndex((t) => t.id === milestoneId);
    if (trancheIndex === -1) {
      throw new Error(`Milestone tranche ${milestoneId} not found.`);
    }

    const tranche = tranches[trancheIndex];

    // Check sequential progression: all prior tranches must be RELEASED
    for (let i = 0; i < trancheIndex; i++) {
      if (tranches[i].status !== 'RELEASED') {
        throw new Error(
          `Cannot submit report for Milestone ${tranche.milestoneNumber} before prior Milestone ${tranches[i].milestoneNumber} is released.`
        );
      }
    }

    if (tranche.status === 'RELEASED') {
      throw new Error(`Funds for Milestone ${tranche.milestoneNumber} have already been released.`);
    }

    // Reset votes if previously rejected/resubmitted
    const vKey = this.voteKey(campaignId, milestoneId);
    this.votes.set(vKey, []);

    const report: MilestoneCompletionReport = {
      reportId: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      milestoneId: tranche.id,
      campaignId,
      submittedBy: creatorAddress,
      submittedAt: now,
      summary: input.summary.trim(),
      evidenceUrls: input.evidenceUrls || [],
      deliverables: input.deliverables?.trim(),
    };

    const votingStartedAt = now;
    const votingEndsAt = now + VOTING_WINDOW_MS; // 72 hours window

    tranche.completionReport = report;
    tranche.status = 'VOTING';
    tranche.votingStartedAt = votingStartedAt;
    tranche.votingEndsAt = votingEndsAt;
    tranche.votesFor = 0;
    tranche.votesAgainst = 0;
    tranche.totalBackersVoted = 0;
    tranche.releasedAt = undefined;
    tranche.releasedAmount = undefined;
    tranche.releasedTxHash = undefined;
    tranche.releaseReason = undefined;

    // AC 2: Backers receive vote notification and have 72 hours to vote
    const contributions = backersService.getContributions(campaignId);
    const uniqueBackers = Array.from(
      new Set(contributions.map((c) => c.backerAddress))
    );

    const campaignName = campaign?.name || `Campaign #${campaignId}`;
    try {
      await pushNotificationService.notifyBackersVoteRequired(
        campaignId,
        campaignName,
        tranche.title,
        uniqueBackers,
        votingEndsAt
      );
    } catch (err) {
      console.warn('Failed to dispatch backer push notifications:', err);
    }

    return tranche;
  }

  /**
   * Acceptance Criteria 2: Backers cast vote during 72-hour window.
   * - Only verified backers can vote.
   * - Backer can only vote once.
   * - Voting closed after 72 hours.
   */
  public async castVote(
    input: CastMilestoneVoteInput,
    now = Date.now(),
    campaignLookup?: () => CampaignRecord | null
  ): Promise<{ vote: BackerMilestoneVote; tranche: MilestoneTranche; released: boolean }> {
    const campaignId = input.campaignId.trim();
    const milestoneId = input.milestoneId.trim();
    const voterAddress = input.voterAddress.trim();

    const tranches = await this.getTranches(campaignId, now, campaignLookup);
    const tranche = tranches.find((t) => t.id === milestoneId);
    if (!tranche) {
      throw new Error(`Milestone tranche ${milestoneId} not found.`);
    }

    if (tranche.status !== 'VOTING') {
      if (tranche.status === 'RELEASED') {
        throw new Error('Voting is closed: Tranche funds have already been released.');
      }
      throw new Error('Voting is not currently active for this milestone.');
    }

    // Check if 72 hours timeout lapsed
    if (tranche.votingEndsAt && now >= tranche.votingEndsAt) {
      // Auto-trigger release evaluation on timeout
      await this.evaluateAndTriggerRelease(
        { campaignId, milestoneId },
        now,
        campaignLookup
      );
      throw new Error('72-hour voting window has lapsed. Voting is closed.');
    }

    // Verify backer status
    const isBacker = backersService.isBacker(campaignId, voterAddress);
    if (!isBacker) {
      throw new Error('Unauthorized: Only verified backers of this campaign are eligible to vote.');
    }

    const vKey = this.voteKey(campaignId, milestoneId);
    const existingVotes = this.votes.get(vKey) || [];

    const alreadyVoted = existingVotes.some((v) =>
      sameAddress(v.voterAddress, voterAddress)
    );
    if (alreadyVoted) {
      throw new Error(`Backer ${voterAddress} has already cast a vote for this milestone.`);
    }

    const vote: BackerMilestoneVote = {
      id: `vote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      campaignId,
      milestoneId,
      voterAddress,
      approve: Boolean(input.approve),
      votedAt: now,
      comment: input.comment?.trim(),
    };

    existingVotes.push(vote);
    this.votes.set(vKey, existingVotes);

    if (vote.approve) {
      tranche.votesFor += 1;
    } else {
      tranche.votesAgainst += 1;
    }
    tranche.totalBackersVoted = existingVotes.length;

    // AC 3: Release triggered if majority approves
    const uniqueBackers = this.getEligibleBackers(campaignId);
    const totalBackers = uniqueBackers.length;

    let released = false;
    // If strict majority of all backers approve, or majority of votes cast approves and all backers voted
    const majorityOfTotalBackers = totalBackers > 0 && tranche.votesFor > Math.floor(totalBackers / 2);
    const allBackersVotedAndMajorityApprove =
      tranche.totalBackersVoted >= totalBackers && tranche.votesFor > tranche.votesAgainst;

    if (majorityOfTotalBackers || allBackersVotedAndMajorityApprove) {
      const releaseResult = await this.evaluateAndTriggerRelease(
        { campaignId, milestoneId },
        now,
        campaignLookup
      );
      released = releaseResult.ok;
    }

    return { vote, tranche, released };
  }

  /**
   * Acceptance Criteria 3: Release triggered if majority approves or timeout lapses.
   */
  public async evaluateAndTriggerRelease(
    input: TriggerMilestoneReleaseInput,
    now = Date.now(),
    campaignLookup?: () => CampaignRecord | null
  ): Promise<{ ok: boolean; tranche: MilestoneTranche; releaseReason?: 'majority_approval' | 'timeout_lapsed'; message: string }> {
    const campaignId = input.campaignId.trim();
    const milestoneId = input.milestoneId.trim();

    const tranches = await this.getTranches(campaignId, now, campaignLookup);
    const trancheIndex = tranches.findIndex((t) => t.id === milestoneId);
    if (trancheIndex === -1) {
      throw new Error(`Milestone tranche ${milestoneId} not found.`);
    }

    const tranche = tranches[trancheIndex];

    if (tranche.status === 'RELEASED') {
      return {
        ok: true,
        tranche,
        releaseReason: tranche.releaseReason,
        message: 'Tranche funds were already released.',
      };
    }

    if (tranche.status !== 'VOTING' && tranche.status !== 'APPROVED') {
      throw new Error(
        `Cannot release funds: Milestone is in "${tranche.status}" state, not active in voting.`
      );
    }

    const votingEndsAt = tranche.votingEndsAt ?? 0;
    const timeoutLapsed = now >= votingEndsAt;

    const totalVotes = tranche.votesFor + tranche.votesAgainst;
    const majorityApproves =
      (totalVotes > 0 && tranche.votesFor > tranche.votesAgainst) ||
      (this.getEligibleBackers(campaignId).length > 0 &&
        tranche.votesFor > Math.floor(this.getEligibleBackers(campaignId).length / 2));

    let releaseReason: 'majority_approval' | 'timeout_lapsed' | undefined;

    if (majorityApproves) {
      releaseReason = 'majority_approval';
    } else if (timeoutLapsed) {
      releaseReason = 'timeout_lapsed';
    } else {
      return {
        ok: false,
        tranche,
        message: 'Release conditions not met: Majority has not approved and 72-hour timeout has not lapsed.',
      };
    }

    // Trigger fund release
    tranche.status = 'RELEASED';
    tranche.releasedAt = now;
    tranche.releasedAmount = tranche.targetAmount;
    tranche.releasedTxHash = `tx-rel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    tranche.releaseReason = releaseReason;

    const campaign = campaignLookup
      ? campaignLookup()
      : await getCampaign(campaignId);
    const recipient =
      campaign?.creator ||
      backersService.getCampaignCreator(campaignId) ||
      tranche.completionReport?.submittedBy ||
      'creator';

    try {
      await pushNotificationService.notifyMilestoneFundsReleased(
        campaignId,
        campaign?.name || `Campaign #${campaignId}`,
        tranche.title,
        tranche.releasedAmount,
        recipient
      );
    } catch (err) {
      console.warn('Failed to dispatch funds released push notification:', err);
    }

    return {
      ok: true,
      tranche,
      releaseReason,
      message: `Funds released successfully for Milestone ${tranche.milestoneNumber} via ${releaseReason === 'majority_approval' ? 'majority backer approval' : '72-hour timeout lapse'}.`,
    };
  }

  /**
   * Get voting summary and remaining time for a milestone.
   */
  public async getVotingSummary(
    campaignId: string,
    milestoneId: string,
    now = Date.now(),
    campaignLookup?: () => CampaignRecord | null
  ): Promise<MilestoneReleaseVotingSummary> {
    const tranche = await this.getTrancheById(campaignId, milestoneId, now, campaignLookup);
    if (!tranche) {
      throw new Error(`Milestone tranche ${milestoneId} not found.`);
    }

    const eligibleBackers = this.getEligibleBackers(campaignId);
    const totalVotes = tranche.votesFor + tranche.votesAgainst;
    const votingEndsAt = tranche.votingEndsAt ?? 0;
    const timeRemainingMs = Math.max(0, votingEndsAt - now);
    const isTimeoutLapsed = tranche.votingStartedAt ? now >= votingEndsAt : false;

    const approvalPercentage =
      totalVotes > 0 ? Math.round((tranche.votesFor / totalVotes) * 100) : 0;

    const isMajorityApproved =
      (totalVotes > 0 && tranche.votesFor > tranche.votesAgainst) ||
      (eligibleBackers.length > 0 && tranche.votesFor > Math.floor(eligibleBackers.length / 2));

    const canRelease =
      tranche.status === 'VOTING' && (isMajorityApproved || isTimeoutLapsed);

    return {
      milestoneId: tranche.id,
      campaignId,
      milestoneNumber: tranche.milestoneNumber,
      title: tranche.title,
      status: tranche.status,
      votingStartedAt: tranche.votingStartedAt,
      votingEndsAt: tranche.votingEndsAt,
      timeRemainingMs,
      isTimeoutLapsed,
      votesFor: tranche.votesFor,
      votesAgainst: tranche.votesAgainst,
      totalVotes,
      totalEligibleBackers: eligibleBackers.length,
      approvalPercentage,
      isMajorityApproved,
      canRelease,
      releaseReason: tranche.releaseReason,
    };
  }

  /**
   * Get list of votes cast on a milestone.
   */
  public getVotes(campaignId: string, milestoneId: string): BackerMilestoneVote[] {
    const vKey = this.voteKey(campaignId, milestoneId);
    return [...(this.votes.get(vKey) || [])];
  }

  /**
   * Helper to retrieve all unique eligible backer addresses for a campaign.
   */
  public getEligibleBackers(campaignId: string): string[] {
    const contributions = backersService.getContributions(campaignId);
    return Array.from(new Set(contributions.map((c) => c.backerAddress)));
  }
}

export const campaignMilestoneReleaseService = new CampaignMilestoneReleaseService();
