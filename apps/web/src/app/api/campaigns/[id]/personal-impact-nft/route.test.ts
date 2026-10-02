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

describe('Personal Impact NFT API Route (/api/campaigns/[id]/personal-impact-nft)', () => {
  let dataSource: InMemoryCampaignDataSource;
  const campaignId = 'camp-sponsor-nft-100';
  const sponsorAddress = 'GSPONSOR_VERIFIED_1234567890';

  beforeEach(async () => {
    campaignImpactNftService.clearAll();
    dataSource = new InMemoryCampaignDataSource();
    setCampaignDataSource(dataSource);

    const created = await createCampaign(
      {
        id: campaignId,
        creator: 'GCREATOR_TEST_WALLET',
        name: 'Amazon Biodiversity Corridor',
        goalAmount: '10000',
        raisedAmount: '10000',
        treeCount: 1000,
        co2SequestrationKg: '20000', // 20 tonnes
        sponsors: [
          {
            id: 'sp-1',
            campaignId,
            address: sponsorAddress,
            amount: '2500', // 25% of total
            token: 'USDC',
            sponsoredAt: Date.now() - 10000,
          },
        ],
      },
      dataSource
    );

    const pending = await transitionCampaignStatus(created, 'PENDING_VERIFICATION', 'admin', 'Submitted', dataSource);
    const active = await transitionCampaignStatus(pending, 'ACTIVE', 'admin', 'Activated', dataSource);
    await transitionCampaignStatus(active, 'COMPLETED', 'admin', 'Complete', dataSource);
  });

  it('allows a sponsor to mint personal impact NFT via POST', async () => {
    const req = new NextRequest(`http://localhost/api/campaigns/${campaignId}/personal-impact-nft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sponsorAddress }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: campaignId }) });
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.nft.sponsorAddress).toBe(sponsorAddress);
    expect(data.nft.contributionSharePercentage).toBe(25);
    expect(data.nft.personalTrees).toBe(250); // 25% of 1000
    expect(data.nft.personalCo2Tonnes).toBe(5); // 25% of 20
    expect(data.nft.tier).toBe('GOLD');
    expect(data.nft.nftType).toBe('PERSONAL_IMPACT');
  });

  it('rejects minting personal impact NFT for an address that did not sponsor', async () => {
    const req = new NextRequest(`http://localhost/api/campaigns/${campaignId}/personal-impact-nft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sponsorAddress: 'GNOT_A_SPONSOR_WALLET' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: campaignId }) });
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('no recorded contributions');
  });

  it('rejects minting when sponsorAddress is missing in request body', async () => {
    const req = new NextRequest(`http://localhost/api/campaigns/${campaignId}/personal-impact-nft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req, { params: Promise.resolve({ id: campaignId }) });
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('sponsorAddress is required');
  });

  it('retrieves sponsor personal impact NFT via GET with ?sponsorAddress', async () => {
    // First mint it
    await campaignImpactNftService.mintSponsorPersonalImpactNFT(campaignId, sponsorAddress, {
      dataSource,
    });

    const req = new NextRequest(
      `http://localhost/api/campaigns/${campaignId}/personal-impact-nft?sponsorAddress=${encodeURIComponent(sponsorAddress)}`
    );
    const res = await GET(req, { params: Promise.resolve({ id: campaignId }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.nft.personalTrees).toBe(250);
    expect(data.nft.sponsorAddress).toBe(sponsorAddress);
  });

  it('retrieves all personal impact NFTs for a campaign via GET without query param', async () => {
    await campaignImpactNftService.mintSponsorPersonalImpactNFT(campaignId, sponsorAddress, {
      dataSource,
    });

    const req = new NextRequest(`http://localhost/api/campaigns/${campaignId}/personal-impact-nft`);
    const res = await GET(req, { params: Promise.resolve({ id: campaignId }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(1);
    expect(data.nfts[0].sponsorAddress).toBe(sponsorAddress);
  });
});
