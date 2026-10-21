import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  campaignMilestoneReleaseService,
  VOTING_WINDOW_HOURS,
  VOTING_WINDOW_MS,
} from './campaign-milestone-release.service';
import { backersService } from './campaign-backers.service';
import { pushNotificationService } from './push-notification.service';
import type { CampaignRecord } from './campaign.service';

const CAMPAIGN_ID = 'camp-milestone-101';
const CREATOR = 'GCREATOR...XXXX';
const BACKER_1 = 'GBACKER1...AAAA';
const BACKER_2 = 'GBACKER2...BBBB';
const BACKER_3 = 'GBACKER3...CCCC';
const NON_BACKER = 'GSTRANGER...ZZZZ';
const NOW = 1_700_000_000_000;

function createTestCampaign(
  status: CampaignRecord['status'] = 'COMPLETED',
  raisedAmount = '10000'
): CampaignRecord {
  return {
    id: CAMPAIGN_ID,
    creator: CREATOR,
    name: 'Amazon Rainforest Reforestation',
    status,
    goalAmount: '10000',
    raisedAmount,
    sponsorCount: 3,
    treeCount: 100,
    createdAt: NOW - 30 * 24 * 60 * 60 * 1000,
    updatedAt: NOW - 5 * 24 * 60 * 60 * 1000,
    statusChangedAt: NOW - 5 * 24 * 60 * 60 * 1000,
    sponsors: [],
    statusHistory: [],
  };
}

const campaignLookup = () => createTestCampaign('COMPLETED');

describe('CampaignMilestoneReleaseService', () => {
  beforeEach(() => {
    campaignMilestoneReleaseService.reset();
    backersService.reset();
    backersService.registerCampaignCreator(CAMPAIGN_ID, CREATOR);

    // Register verified backers
    backersService.recordContribution({
      campaignId: CAMPAIGN_ID,
      backerAddress: BACKER_1,
      amount: '3000',
      token: 'XLM',
      displayName: 'Alice',
    });
    backersService.recordContribution({
      campaignId: CAMPAIGN_ID,
      backerAddress: BACKER_2,
      amount: '4000',
      token: 'XLM',
      displayName: 'Bob',
    });
    backersService.recordContribution({
      campaignId: CAMPAIGN_ID,
      backerAddress: BACKER_3,
      amount: '3000',
      token: 'XLM',
      displayName: 'Charlie',
    });
  });

  describe('Tranche Initialization', () => {
    it('initializes default 3 tranches (30%, 30%, 40%) when none configured', async () => {
      const tranches = await campaignMilestoneReleaseService.getTranches(
        CAMPAIGN_ID,
        NOW,
        campaignLookup
      );

      expect(tranches).toHaveLength(3);
      expect(tranches[0].milestoneNumber).toBe(1);
      expect(tranches[0].tranchePercentage).toBe(30);
      expect(tranches[0].targetAmount).toBe('3000');
      expect(tranches[0].status).toBe('PENDING');

      expect(tranches[1].milestoneNumber).toBe(2);
      expect(tranches[1].tranchePercentage).toBe(30);

      expect(tranches[2].milestoneNumber).toBe(3);
      expect(tranches[2].tranchePercentage).toBe(40);
    });

    it('supports custom tranche configurations', () => {
      const customTranches = campaignMilestoneReleaseService.initializeTranches({
        campaignId: 'custom-camp',
        totalAmount: '20000',
        tranches: [
          {
            title: 'Phase 1',
            description: 'Land prep',
            tranchePercentage: 50,
          },
          {
            title: 'Phase 2',
            description: 'Planting',
            tranchePercentage: 50,
          },
        ],
      });

      expect(customTranches).toHaveLength(2);
      expect(customTranches[0].targetAmount).toBe('10000');
      expect(customTranches[1].targetAmount).toBe('10000');
    });
  });

  describe('Acceptance Criteria 1: Creator submits milestone completion report', () => {
    it('allows campaign creator to submit completion report once campaign is closed', async () => {
      const notifySpy = vi.spyOn(pushNotificationService, 'notifyBackersVoteRequired');

      const tranches = await campaignMilestoneReleaseService.getTranches(
        CAMPAIGN_ID,
        NOW,
        campaignLookup
      );
      const m1 = tranches[0];

      const updated = await campaignMilestoneReleaseService.submitCompletionReport(
        {
          campaignId: CAMPAIGN_ID,
          milestoneId: m1.id,
          creatorAddress: CREATOR,
          summary: 'Successfully cleared 5 hectares and seeded 2,000 native saplings.',
          evidenceUrls: ['https://ipfs.io/ipfs/QmReportPhoto1'],
          deliverables: '5 hectares site nursery complete',
        },
        NOW,
        campaignLookup
      );

      expect(updated.status).toBe('VOTING');
      expect(updated.completionReport).toBeDefined();
      expect(updated.completionReport?.summary).toContain('5 hectares and seeded');
      expect(updated.completionReport?.submittedBy).toBe(CREATOR);
      expect(updated.votingStartedAt).toBe(NOW);
      expect(updated.votingEndsAt).toBe(NOW + VOTING_WINDOW_MS); // 72 hours window
      expect(updated.votingEndsAt! - updated.votingStartedAt!).toBe(72 * 60 * 60 * 1000);

      // Verify backer notification dispatch
      expect(notifySpy).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        'Amazon Rainforest Reforestation',
        m1.title,
        expect.arrayContaining([BACKER_1, BACKER_2, BACKER_3]),
        NOW + VOTING_WINDOW_MS
      );
    });

    it('rejects report submission from non-creators', async () => {
      const tranches = await campaignMilestoneReleaseService.getTranches(
        CAMPAIGN_ID,
        NOW,
        campaignLookup
      );

      await expect(
        campaignMilestoneReleaseService.submitCompletionReport(
          {
            campaignId: CAMPAIGN_ID,
            milestoneId: tranches[0].id,
            creatorAddress: NON_BACKER,
            summary: 'Imposter trying to submit report',
          },
          NOW,
          campaignLookup
        )
      ).rejects.toThrow(/Only the campaign creator/);
    });

    it('rejects report submission if campaign is still active / open', async () => {
      const activeLookup = () => createTestCampaign('ACTIVE');
      const tranches = await campaignMilestoneReleaseService.getTranches(
        CAMPAIGN_ID,
        NOW,
        activeLookup
      );

      await expect(
        campaignMilestoneReleaseService.submitCompletionReport(
          {
            campaignId: CAMPAIGN_ID,
            milestoneId: tranches[0].id,
            creatorAddress: CREATOR,
            summary: 'Premature report',
          },
          NOW,
          activeLookup
        )
      ).rejects.toThrow(/Campaign is not closed/);
    });

    it('enforces sequential milestone progression (cannot skip to Milestone 2 before Milestone 1 is released)', async () => {
      const tranches = await campaignMilestoneReleaseService.getTranches(
        CAMPAIGN_ID,
        NOW,
        campaignLookup
      );
      const m2 = tranches[1];

      await expect(
        campaignMilestoneReleaseService.submitCompletionReport(
          {
            campaignId: CAMPAIGN_ID,
            milestoneId: m2.id,
            creatorAddress: CREATOR,
            summary: 'Attempting to skip ahead to milestone 2',
          },
          NOW,
          campaignLookup
        )
      ).rejects.toThrow(/prior Milestone 1 is released/);
    });
  });

  describe('Acceptance Criteria 2: Backers receive vote notification and have 72 hours to vote', () => {
    let milestoneId: string;

    beforeEach(async () => {
      const tranches = await campaignMilestoneReleaseService.getTranches(
        CAMPAIGN_ID,
        NOW,
        campaignLookup
      );
      milestoneId = tranches[0].id;
      await campaignMilestoneReleaseService.submitCompletionReport(
        {
          campaignId: CAMPAIGN_ID,
          milestoneId,
          creatorAddress: CREATOR,
          summary: 'Milestone 1 completed report',
        },
        NOW,
        campaignLookup
      );
    });

    it('allows verified backers to cast approval and rejection votes within 72 hours', async () => {
      const res1 = await campaignMilestoneReleaseService.castVote(
        {
          campaignId: CAMPAIGN_ID,
          milestoneId,
          voterAddress: BACKER_1,
          approve: true,
          comment: 'Looks great, nursery photos confirmed.',
        },
        NOW + 1000,
        campaignLookup
      );

      expect(res1.vote.approve).toBe(true);
      expect(res1.tranche.votesFor).toBe(1);
      expect(res1.tranche.votesAgainst).toBe(0);
      expect(res1.tranche.totalBackersVoted).toBe(1);

      const res2 = await campaignMilestoneReleaseService.castVote(
        {
          campaignId: CAMPAIGN_ID,
          milestoneId,
          voterAddress: BACKER_2,
          approve: false,
          comment: 'Need more drone footage.',
        },
        NOW + 2000,
        campaignLookup
      );

      expect(res2.vote.approve).toBe(false);
      expect(res2.tranche.votesFor).toBe(1);
      expect(res2.tranche.votesAgainst).toBe(1);
      expect(res2.tranche.totalBackersVoted).toBe(2);
    });

    it('rejects votes from non-backers', async () => {
      await expect(
        campaignMilestoneReleaseService.castVote(
          {
            campaignId: CAMPAIGN_ID,
            milestoneId,
            voterAddress: NON_BACKER,
            approve: true,
          },
          NOW + 1000,
          campaignLookup
        )
      ).rejects.toThrow(/Only verified backers/);
    });

    it('rejects duplicate votes from the same backer', async () => {
      await campaignMilestoneReleaseService.castVote(
        {
          campaignId: CAMPAIGN_ID,
          milestoneId,
          voterAddress: BACKER_1,
          approve: true,
        },
        NOW + 1000,
        campaignLookup
      );

      await expect(
        campaignMilestoneReleaseService.castVote(
          {
            campaignId: CAMPAIGN_ID,
            milestoneId,
            voterAddress: BACKER_1,
            approve: true,
          },
          NOW + 2000,
          campaignLookup
        )
      ).rejects.toThrow(/already cast a vote/);
    });

    it('rejects votes cast after the 72-hour voting window has lapsed', async () => {
      const AFTER_72_HOURS = NOW + 72 * 60 * 60 * 1000 + 1000;

      await expect(
        campaignMilestoneReleaseService.castVote(
          {
            campaignId: CAMPAIGN_ID,
            milestoneId,
            voterAddress: BACKER_1,
            approve: true,
          },
          AFTER_72_HOURS,
          campaignLookup
        )
      ).rejects.toThrow(/72-hour voting window has lapsed/);
    });
  });

  describe('Acceptance Criteria 3: Release triggered if majority approves or timeout lapses', () => {
    let milestoneId: string;

    beforeEach(async () => {
      const tranches = await campaignMilestoneReleaseService.getTranches(
        CAMPAIGN_ID,
        NOW,
        campaignLookup
      );
      milestoneId = tranches[0].id;
      await campaignMilestoneReleaseService.submitCompletionReport(
        {
          campaignId: CAMPAIGN_ID,
          milestoneId,
          creatorAddress: CREATOR,
          summary: 'Milestone 1 completed report',
        },
        NOW,
        campaignLookup
      );
    });

    it('triggers fund release when majority of backers approve', async () => {
      // 3 eligible backers: Alice, Bob, Charlie.
      // Alice votes approve
      const v1 = await campaignMilestoneReleaseService.castVote(
        {
          campaignId: CAMPAIGN_ID,
          milestoneId,
          voterAddress: BACKER_1,
          approve: true,
        },
        NOW + 1000,
        campaignLookup
      );
      expect(v1.released).toBe(false); // 1 / 3 is not strict majority yet

      // Bob votes approve (2 / 3 is strict majority > 50%)
      const v2 = await campaignMilestoneReleaseService.castVote(
        {
          campaignId: CAMPAIGN_ID,
          milestoneId,
          voterAddress: BACKER_2,
          approve: true,
        },
        NOW + 2000,
        campaignLookup
      );

      expect(v2.released).toBe(true);
      expect(v2.tranche.status).toBe('RELEASED');
      expect(v2.tranche.releasedAmount).toBe('3000');
      expect(v2.tranche.releasedTxHash).toBeDefined();
      expect(v2.tranche.releaseReason).toBe('majority_approval');
    });

    it('triggers fund release when 72-hour timeout lapses even without majority votes', async () => {
      // Only 1 backer voted (or even 1 reject vote)
      await campaignMilestoneReleaseService.castVote(
        {
          campaignId: CAMPAIGN_ID,
          milestoneId,
          voterAddress: BACKER_1,
          approve: false, // Backer voted reject
        },
        NOW + 1000,
        campaignLookup
      );

      // Within 72 hours, cannot release because majority did not approve
      const midCheck = await campaignMilestoneReleaseService.evaluateAndTriggerRelease(
        { campaignId: CAMPAIGN_ID, milestoneId },
        NOW + 10 * 60 * 60 * 1000, // 10 hours in
        campaignLookup
      );
      expect(midCheck.ok).toBe(false);

      // 72 hours lapse!
      const TIMEOUT_LAPSED = NOW + VOTING_WINDOW_MS + 1000;
      const timeoutRelease = await campaignMilestoneReleaseService.evaluateAndTriggerRelease(
        { campaignId: CAMPAIGN_ID, milestoneId },
        TIMEOUT_LAPSED,
        campaignLookup
      );

      expect(timeoutRelease.ok).toBe(true);
      expect(timeoutRelease.releaseReason).toBe('timeout_lapsed');
      expect(timeoutRelease.tranche.status).toBe('RELEASED');
      expect(timeoutRelease.tranche.releasedAmount).toBe('3000');
      expect(timeoutRelease.tranche.releasedTxHash).toBeDefined();
    });

    it('unlocks next milestone report submission after tranche 1 is released', async () => {
      // Release Milestone 1 via majority
      await campaignMilestoneReleaseService.castVote(
        { campaignId: CAMPAIGN_ID, milestoneId, voterAddress: BACKER_1, approve: true },
        NOW + 1000,
        campaignLookup
      );
      await campaignMilestoneReleaseService.castVote(
        { campaignId: CAMPAIGN_ID, milestoneId, voterAddress: BACKER_2, approve: true },
        NOW + 2000,
        campaignLookup
      );

      const tranches = await campaignMilestoneReleaseService.getTranches(
        CAMPAIGN_ID,
        NOW + 3000,
        campaignLookup
      );
      expect(tranches[0].status).toBe('RELEASED');

      // Now Milestone 2 can be submitted
      const m2 = tranches[1];
      const m2Updated = await campaignMilestoneReleaseService.submitCompletionReport(
        {
          campaignId: CAMPAIGN_ID,
          milestoneId: m2.id,
          creatorAddress: CREATOR,
          summary: 'Milestone 2 completed: Saplings planted and irrigation working.',
        },
        NOW + 4000,
        campaignLookup
      );

      expect(m2Updated.status).toBe('VOTING');
      expect(m2Updated.milestoneNumber).toBe(2);
      expect(m2Updated.votingEndsAt).toBe(NOW + 4000 + VOTING_WINDOW_MS);
    });

    it('provides accurate voting summary and countdown calculations', async () => {
      const summaryInitial = await campaignMilestoneReleaseService.getVotingSummary(
        CAMPAIGN_ID,
        milestoneId,
        NOW + 1000,
        campaignLookup
      );

      expect(summaryInitial.timeRemainingMs).toBe(VOTING_WINDOW_MS - 1000);
      expect(summaryInitial.isTimeoutLapsed).toBe(false);
      expect(summaryInitial.totalEligibleBackers).toBe(3);
      expect(summaryInitial.totalVotes).toBe(0);
      expect(summaryInitial.canRelease).toBe(false);

      // Check after timeout
      const summaryExpired = await campaignMilestoneReleaseService.getVotingSummary(
        CAMPAIGN_ID,
        milestoneId,
        NOW + VOTING_WINDOW_MS + 5000,
        campaignLookup
      );
      expect(summaryExpired.timeRemainingMs).toBe(0);
      expect(summaryExpired.isTimeoutLapsed).toBe(true);
      expect(summaryExpired.canRelease).toBe(true);
    });
  });
});
