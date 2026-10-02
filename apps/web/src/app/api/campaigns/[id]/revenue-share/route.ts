import { NextRequest, NextResponse } from 'next/server';
import { creatorRevenueShareService } from '@/services/creator-revenue-share.service';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const totalRaisedAmount = Number(searchParams.get('totalRaisedAmount') || '0');
    const creatorAddress = searchParams.get('creatorAddress') || undefined;

    const split = creatorRevenueShareService.calculateRevenueSplit({
      totalRaisedAmount,
      creatorAddress,
    });

    return NextResponse.json({ success: true, split });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to calculate revenue share' },
      { status: 400 }
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
    const { creatorAddress, totalRaisedAmount, currency } = body;

    if (!creatorAddress || totalRaisedAmount === undefined) {
      return NextResponse.json(
        { success: false, error: 'creatorAddress and totalRaisedAmount are required' },
        { status: 400 }
      );
    }

    const split = await creatorRevenueShareService.processRevenueSplit(
      campaignId,
      creatorAddress,
      Number(totalRaisedAmount),
      currency
    );

    return NextResponse.json({ success: true, split });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process revenue split' },
      { status: 400 }
    );
  }
}
