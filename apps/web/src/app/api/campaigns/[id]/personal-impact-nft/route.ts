import { NextRequest, NextResponse } from 'next/server';
import { campaignImpactNftService, ImpactNFTError } from '@/services/campaign-impact-nft.service';

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

async function resolveCampaignId(context: RouteContext): Promise<string> {
  const resolved = await context.params;
  return resolved.id;
}

/**
 * GET /api/campaigns/[id]/personal-impact-nft?sponsorAddress=...
 * Retrieves personal impact NFT for a specific sponsor, or all personal impact NFTs for the campaign.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const campaignId = await resolveCampaignId(context);
    const { searchParams } = new URL(request.url);
    const sponsorAddress = searchParams.get('sponsorAddress');

    if (sponsorAddress) {
      const nft = await campaignImpactNftService.getSponsorPersonalImpactNFT(campaignId, sponsorAddress);
      if (!nft) {
        return NextResponse.json(
          {
            success: false,
            error: `No personal impact NFT found for sponsor "${sponsorAddress}" in campaign "${campaignId}"`,
          },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, nft });
    }

    const nfts = await campaignImpactNftService.getAllSponsorPersonalImpactNFTs(campaignId);
    return NextResponse.json({ success: true, count: nfts.length, nfts });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch personal impact NFTs' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns/[id]/personal-impact-nft
 * Body: { sponsorAddress: string, txHash?: string }
 * Allows sponsors to mint their personal impact NFT for a completed campaign.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const campaignId = await resolveCampaignId(context);
    const body = await request.json().catch(() => ({}));
    const { sponsorAddress, txHash } = body || {};

    if (!sponsorAddress || typeof sponsorAddress !== 'string' || !sponsorAddress.trim()) {
      return NextResponse.json(
        { success: false, error: 'sponsorAddress is required to mint a personal impact NFT' },
        { status: 400 }
      );
    }

    const nft = await campaignImpactNftService.mintSponsorPersonalImpactNFT(campaignId, sponsorAddress, {
      txHash,
    });

    return NextResponse.json({ success: true, nft }, { status: 201 });
  } catch (error: any) {
    if (error instanceof ImpactNFTError) {
      const status =
        error.code === 'NOT_FOUND' ? 404 : error.code === 'NOT_COMPLETED' ? 400 : error.code === 'NOT_ELIGIBLE' ? 403 : 400;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to mint personal impact NFT' },
      { status: 500 }
    );
  }
}
