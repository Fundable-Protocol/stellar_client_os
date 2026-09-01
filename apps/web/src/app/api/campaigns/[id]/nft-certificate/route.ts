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
    const { campaignTitle, creatorAddress, fundingGoal, totalRaised, recipientAddress, isTradeable = false, carbonCredits } = body;

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
      isTradeable,
      carbonCredits,
    });

    return NextResponse.json({ success: true, certificate }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to issue NFT certificate' },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
)
{
  try {
    const campaignId = params.id;
    const body = await request.json();
    const { certificateId, recipientAddress, isTradeable, price } = body;

    if (!certificateId) {
      return NextResponse.json(
        { success: false, error: 'certificateId is required' },
        { status: 400 }
      );
    }

    let updatedCertificate;
    if (recipientAddress) {
      // Transfer ownership of the certificate
      updatedCertificate = await onChainCampaignTrackingService.transferNFTCertificate(certificateId, recipientAddress);
    } else if (isTradeable !== undefined) {
      // Update tradeability status on a marketplace
      updatedCertificate = await onChainCampaignTrackingService.setCertificateTradeable(certificateId, isTradeable, price);
    } else {
      return NextResponse.json(
        { success: false, error: 'Either recipientAddress for transfer or isTradeable for trade status is required' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, certificate: updatedCertificate });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update NFT certificate' },
      { status: 400 }
    );
  }
}