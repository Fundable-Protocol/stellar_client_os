import { describe, expect, it, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createCampaign,
  InMemoryCampaignDataSource,
  setCampaignDataSource,
  transitionCampaignStatus,
} from '@/services/campaign.service';
import { campaignImpactNftService } from '@/services/campaign-impact-nft.service';
import { GET, POST } from './route';

describe('Completion NFT API Route (/api/campaigns/[id]/completion-nft)', () => {
  let dataSource: InMemoryCampaignDataSource;
  const campaignId = 'camp-complete-100';

  beforeEach(async () => {
    campaignImpactNftService.clearAll();
    dataSource = new InMemoryCampaignDataSource();
    setCampaignDataSource(dataSource);

    const created = await createCampaign(
      {
        id: campaignId,
        creator: 'GCREATOR_TEST_WALLET',
        name: 'Evergreen Canopy Initiative',
        goalAmount: '5000',
        treeCount: 500,
        co2SequestrationKg: '10000',
        location: 'Cascade Range, OR',
        species: 'Pseudotsuga menziesii',
      },
      dataSource
    );

    // Transition to PENDING_VERIFICATION -> ACTIVE -> COMPLETED
    const pending = await transitionCampaignStatus(created, 'PENDING_VERIFICATION', 'admin', 'Submitted', dataSource);
    const active = await transitionCampaignStatus(pending, 'ACTIVE', 'admin', 'Activated', dataSource);
    await transitionCampaignStatus(active, 'COMPLETED', 'admin', 'Goal Reached', dataSource);
  });

  it('mints completion NFT via POST showing campaign details, trees, CO2, and sponsor count', async () => {
    const req = new NextRequest(`http://localhost/api/campaigns/${campaignId}/completion-nft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientAddress: 'GRECIPIENT_TEST_WALLET' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: campaignId }) });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.nft.campaignId).toBe(campaignId);
    expect(data.nft.campaignTitle).toBe('Evergreen Canopy Initiative');
    expect(data.nft.totalTrees).toBe(500);
    expect(data.nft.totalCo2Tonnes).toBe(10);
    expect(data.nft.recipientAddress).toBe('GRECIPIENT_TEST_WALLET');
    expect(data.nft.nftType).toBe('CAMPAIGN_COMPLETION');
  });

  it('retrieves minted completion NFT via GET', async () => {
    // First mint it
    await campaignImpactNftService.mintCampaignCompletionNFT(campaignId, { dataSource });

    const req = new NextRequest(`http://localhost/api/campaigns/${campaignId}/completion-nft`);
    const res = await GET(req, { params: Promise.resolve({ id: campaignId }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.nft.totalTrees).toBe(500);
    expect(data.nft.totalCo2Tonnes).toBe(10);
  });

  it('returns 404 when GET is called before NFT is minted', async () => {
    const req = new NextRequest(`http://localhost/api/campaigns/non-existent-campaign/completion-nft`);
    const res = await GET(req, { params: Promise.resolve({ id: 'non-existent-campaign' }) });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('returns 400 via POST if campaign is not completed', async () => {
    const activeCampaignId = 'camp-still-active';
    const draft = await createCampaign(
      {
        id: activeCampaignId,
        creator: 'GCREATOR_WALLET',
        name: 'Incomplete Campaign',
        goalAmount: '5000',
      },
      dataSource
    );
    const pending = await transitionCampaignStatus(draft, 'PENDING_VERIFICATION', 'admin', 'Submitted', dataSource);
    await transitionCampaignStatus(pending, 'ACTIVE', 'admin', 'Activated', dataSource);

    const req = new NextRequest(`http://localhost/api/campaigns/${activeCampaignId}/completion-nft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: activeCampaignId }) });
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('must be completed');
  });
});
