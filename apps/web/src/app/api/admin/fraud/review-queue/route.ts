import { NextRequest, NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-auth';
import { fraudDetectionService } from '@/services/fraud-detection.service';
import { ReviewStatus, RiskLevel } from '@/types/fraud-detection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

const VALID_STATUSES: ReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];
const VALID_RISK_LEVELS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * GET /api/admin/fraud/review-queue — View campaigns in manual review queue.
 * Query params: status (PENDING|APPROVED|REJECTED), riskLevel (LOW|MEDIUM|HIGH|CRITICAL), minRiskScore (number)
 *
 * Each item includes the internal risk score, the contributing signals
 * (common funding sources, identical timing patterns, single-use wallets,
 * circular transaction graph findings) and whether the campaign is currently
 * withheld from the leaderboard and matching funds pending review.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get('status');
    const rawRiskLevel = searchParams.get('riskLevel');
    const rawMinRiskScore = searchParams.get('minRiskScore');

    if (rawStatus && !VALID_STATUSES.includes(rawStatus as ReviewStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Expected one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (rawRiskLevel && !VALID_RISK_LEVELS.includes(rawRiskLevel as RiskLevel)) {
      return NextResponse.json(
        { error: `Invalid riskLevel. Expected one of: ${VALID_RISK_LEVELS.join(', ')}` },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    let minRiskScore: number | undefined;
    if (rawMinRiskScore !== null && rawMinRiskScore !== '') {
      const parsed = Number(rawMinRiskScore);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        return NextResponse.json(
          { error: 'minRiskScore must be a number between 0 and 100' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      minRiskScore = parsed;
    }

    const items = await fraudDetectionService.getManualReviewQueue({
      status: (rawStatus as ReviewStatus) || undefined,
      riskLevel: (rawRiskLevel as RiskLevel) || undefined,
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
