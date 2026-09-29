import { NextRequest, NextResponse } from 'next/server';
import {
  issueCampaignSponsorshipReceipt,
  verifyCampaignSponsorshipReceipt,
} from '@/services/campaign-sponsorship-receipt.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    const body = await request.json();

    const result = issueCampaignSponsorshipReceipt({
      campaignId,
      campaignName: body.campaignName,
      sponsorAddress: body.sponsorAddress,
      treeCount: body.treeCount,
      species: body.species,
      plantingLocation: body.plantingLocation,
      plantedAt: body.plantedAt,
      co2PerTreeKgPerYear: body.co2PerTreeKgPerYear,
      currency: body.currency,
      amountPaidStroops: body.amountPaidStroops,
      transactionHash: body.transactionHash,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to issue sponsorship receipt' },
      { status: 400 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');
    const txHash = searchParams.get('txHash');

    if (!token && !txHash) {
      return NextResponse.json(
        { error: 'Either token or txHash query parameter is required for receipt verification' },
        { status: 400 }
      );
    }

    if (token) {
      const verification = await verifyCampaignSponsorshipReceipt(token);
      return NextResponse.json(verification, { status: 200 });
    }

    return NextResponse.json({ message: 'Receipt verification pending lookup' }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Receipt verification failed' },
      { status: 400 }
    );
  }
}
