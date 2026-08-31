import { NextRequest, NextResponse } from 'next/server';
import { onChainCampaignTrackingService } from '@/services/onchain-campaign-tracking.service';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    const certificates = await onChainCampaignTrackingService.getCertificatesForCampaign(campaignId);
    return NextResponse.json({ success: true, certificates });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch NFT certificates' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    const body = await request.json();
    const { campaignTitle, creatorAddress, fundingGoal, totalRaised, recipientAddress } = body;

    if (!campaignTitle || !creatorAddress || !fundingGoal) {
      return NextResponse.json(
        { success: false, error: 'campaignTitle, creatorAddress, and fundingGoal are required' },
        { status: 400 }
      );
    }

    const certificate = await onChainCampaignTrackingService.issueNFTCertificate({
      campaignId,
      campaignTitle,
      creatorAddress,
      fundingGoal,
      totalRaised: totalRaised || fundingGoal,
      recipientAddress,
    });

    return NextResponse.json({ success: true, certificate }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to issue NFT certificate' },
      { status: 400 }
    );
  }
}
