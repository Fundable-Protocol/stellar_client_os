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
 * GET /api/campaigns/[id]/completion-nft
 * Fetches the official Campaign Completion Impact NFT.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const campaignId = await resolveCampaignId(context);
    const nft = await campaignImpactNftService.getCampaignCompletionNFT(campaignId);

    if (!nft) {
      return NextResponse.json(
        {
          success: false,
          error: `No completion NFT found for campaign "${campaignId}". The campaign may not be completed yet.`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, nft });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch campaign completion NFT' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns/[id]/completion-nft
 * Mints the official Campaign Completion Impact NFT showing:
 * - campaign details
 * - total trees
 * - total CO2
 * - sponsor count
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const campaignId = await resolveCampaignId(context);

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional
    }

    const { recipientAddress, txHash } = body || {};

    const nft = await campaignImpactNftService.mintCampaignCompletionNFT(campaignId, {
      recipientAddress,
      txHash,
    });

    return NextResponse.json({ success: true, nft }, { status: 201 });
  } catch (error: any) {
    if (error instanceof ImpactNFTError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'NOT_COMPLETED' ? 400 : 400;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to mint campaign completion NFT' },
      { status: 500 }
    );
  }
}
