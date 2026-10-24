import { NextRequest, NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-auth';
import { fraudDetectionService } from '@/services/fraud-detection.service';
import { ReviewStatus, RiskLevel } from '@/types/fraud-detection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

/**
 * GET /api/admin/fraud/review-queue — View campaigns in manual review queue.
 * Query params: status (PENDING|APPROVED|REJECTED), riskLevel (LOW|MEDIUM|HIGH|CRITICAL), minRiskScore (number)
 */
export async function GET(request: NextRequest) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as ReviewStatus | null;
    const riskLevel = searchParams.get('riskLevel') as RiskLevel | null;
    const minRiskScore = searchParams.get('minRiskScore')
      ? Number(searchParams.get('minRiskScore'))
      : undefined;

    const items = await fraudDetectionService.getManualReviewQueue({
      status: status || undefined,
      riskLevel: riskLevel || undefined,
      minRiskScore,
    });

    return NextResponse.json(
      {
        data: items,
        total: items.length,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch manual review queue' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
