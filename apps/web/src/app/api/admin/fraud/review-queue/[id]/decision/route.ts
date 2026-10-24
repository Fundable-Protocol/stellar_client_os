import { NextRequest, NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-auth';
import { fraudDetectionService } from '@/services/fraud-detection.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

/**
 * POST /api/admin/fraud/review-queue/:id/decision
 * Body: { decision: 'APPROVE' | 'REJECT', reviewedBy: string, notes?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  try {
    const campaignId = params.id;
    const body = await request.json();
    const { decision, reviewedBy, notes } = body;

    if (!decision || (decision !== 'APPROVE' && decision !== 'REJECT')) {
      return NextResponse.json(
        { error: "decision must be either 'APPROVE' or 'REJECT'" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!reviewedBy || typeof reviewedBy !== 'string') {
      return NextResponse.json(
        { error: 'reviewedBy is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const updatedItem = await fraudDetectionService.processManualReview(campaignId, {
      decision,
      reviewedBy,
      notes,
    });

    return NextResponse.json(
      {
        success: true,
        reviewItem: updatedItem,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 400;
    return NextResponse.json(
      { error: error.message || 'Failed to process manual review decision' },
      { status, headers: NO_STORE_HEADERS }
    );
  }
}
