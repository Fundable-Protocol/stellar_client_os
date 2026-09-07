import { NextRequest, NextResponse } from 'next/server';
import { creatorRevenueShareService } from '@/services/creator-revenue-share.service';
import { CreatorTier } from '@/types/creator-revenue-share';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const creatorAddress = params.id;
    const summary = await creatorRevenueShareService.getCreatorRevenueSummary(creatorAddress);
    return NextResponse.json({ success: true, summary });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch creator tier details' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const creatorAddress = params.id;
    const body = await request.json();
    const { tier } = body;

    const validTiers: CreatorTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
    if (!tier || !validTiers.includes(tier as CreatorTier)) {
      return NextResponse.json(
        { success: false, error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` },
        { status: 400 }
      );
    }

    creatorRevenueShareService.setCreatorTier(creatorAddress, tier as CreatorTier);
    const summary = await creatorRevenueShareService.getCreatorRevenueSummary(creatorAddress);

    return NextResponse.json({ success: true, summary });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update creator tier' },
      { status: 400 }
    );
  }
}
