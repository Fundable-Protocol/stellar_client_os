import { beforeEach, describe, expect, it } from 'vitest';
import { GET as getTranchesRoute, POST as initTranchesRoute } from './route';
import { POST as submitReportRoute } from './report/route';
import { POST as castVoteRoute } from './[milestoneId]/vote/route';
import { POST as triggerReleaseRoute } from './[milestoneId]/release/route';
import { campaignMilestoneReleaseService } from '@/services/campaign-milestone-release.service';
import { backersService } from '@/services/campaign-backers.service';
import { NextRequest } from 'next/server';

const CAMPAIGN_ID = 'test-camp-api-99';
const CREATOR = 'GCREATOR...API99';
const BACKER = 'GBACKER...API99';

function makeRequest(url: string, body?: any, method = 'POST'): NextRequest {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), init);
}

describe('Milestone Fund Release API Routes', () => {
  beforeEach(() => {
    campaignMilestoneReleaseService.reset();
    backersService.reset();
    backersService.registerCampaignCreator(CAMPAIGN_ID, CREATOR);
    backersService.recordContribution({
      campaignId: CAMPAIGN_ID,
      backerAddress: BACKER,
      amount: '5000',
      token: 'XLM',
    });
  });

  it('GET /api/campaigns/[id]/milestone-release returns tranches', async () => {
    const req = makeRequest(`http://localhost:3000/api/campaigns/${CAMPAIGN_ID}/milestone-release`, undefined, 'GET');
    const res = await getTranchesRoute(req, { params: Promise.resolve({ id: CAMPAIGN_ID }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.tranches).toHaveLength(3);
    expect(json.summaries).toHaveLength(3);
  });

  it('POST /api/campaigns/[id]/milestone-release/report submits completion report and opens 72h window', async () => {
    const tranches = await campaignMilestoneReleaseService.getTranches(CAMPAIGN_ID);
    const m1 = tranches[0];

    const req = makeRequest(`http://localhost:3000/api/campaigns/${CAMPAIGN_ID}/milestone-release/report`, {
      milestoneId: m1.id,
      creatorAddress: CREATOR,
      summary: 'Report from API endpoint',
      evidenceUrls: ['https://example.com/proof.jpg'],
    });

    const res = await submitReportRoute(req, { params: Promise.resolve({ id: CAMPAIGN_ID }) });
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.tranche.status).toBe('VOTING');
    expect(json.votingSummary.isTimeoutLapsed).toBe(false);
    expect(json.votingSummary.timeRemainingMs).toBeGreaterThan(0);
  });

  it('POST /api/campaigns/[id]/milestone-release/[milestoneId]/vote records backer vote', async () => {
    const tranches = await campaignMilestoneReleaseService.getTranches(CAMPAIGN_ID);
    const m1 = tranches[0];

    // Submit report first
    await campaignMilestoneReleaseService.submitCompletionReport({
      campaignId: CAMPAIGN_ID,
      milestoneId: m1.id,
      creatorAddress: CREATOR,
      summary: 'Report to vote on',
    });

    const req = makeRequest(`http://localhost:3000/api/campaigns/${CAMPAIGN_ID}/milestone-release/${m1.id}/vote`, {
      voterAddress: BACKER,
      approve: true,
      comment: 'Approved via API',
    });

    const res = await castVoteRoute(req, {
      params: Promise.resolve({ id: CAMPAIGN_ID, milestoneId: m1.id }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.vote.approve).toBe(true);
    expect(json.votingSummary.votesFor).toBe(1);
    expect(json.released).toBe(true); // Single backer is 100% majority
  });

  it('POST /api/campaigns/[id]/milestone-release/[milestoneId]/release triggers release', async () => {
    const tranches = await campaignMilestoneReleaseService.getTranches(CAMPAIGN_ID);
    const m1 = tranches[0];

    await campaignMilestoneReleaseService.submitCompletionReport({
      campaignId: CAMPAIGN_ID,
      milestoneId: m1.id,
      creatorAddress: CREATOR,
      summary: 'Report for release endpoint',
    });

    await campaignMilestoneReleaseService.castVote({
      campaignId: CAMPAIGN_ID,
      milestoneId: m1.id,
      voterAddress: BACKER,
      approve: true,
    });

    const req = makeRequest(`http://localhost:3000/api/campaigns/${CAMPAIGN_ID}/milestone-release/${m1.id}/release`, {
      callerAddress: CREATOR,
    });

    const res = await triggerReleaseRoute(req, {
      params: Promise.resolve({ id: CAMPAIGN_ID, milestoneId: m1.id }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.released).toBe(true);
    expect(json.tranche.status).toBe('RELEASED');
    expect(json.releaseReason).toBe('majority_approval');
  });
});
