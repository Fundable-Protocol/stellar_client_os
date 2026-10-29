import { NextRequest, NextResponse } from 'next/server';
import { authorizeAdminRequest } from '@/lib/admin-auth';
import { fraudDetectionService } from '@/services/fraud-detection.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

/**
 * GET /api/admin/fraud/metrics — Monitor ML model metrics, including False Positive Rate and quarterly retraining status.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  try {
    const metrics = fraudDetectionService.getModelMetrics();
    const retrainingLogs = fraudDetectionService.getRetrainingLogs();
    const isRetrainingDue = fraudDetectionService.isQuarterlyRetrainingDue();

    return NextResponse.json(
      {
        metrics,
        isRetrainingDue,
        retrainingLogs,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch fraud model metrics' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * POST /api/admin/fraud/retrain — Trigger quarterly or manual model retraining.
 * Body: { triggeredBy?: 'QUARTERLY_SCHEDULE' | 'MANUAL', notes?: string }
 */
export async function POST(request: NextRequest) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const { triggeredBy, notes } = body;

    const log = await fraudDetectionService.retrainModel({
      triggeredBy: triggeredBy === 'MANUAL' ? 'MANUAL' : 'QUARTERLY_SCHEDULE',
      notes,
    });

    const metrics = fraudDetectionService.getModelMetrics();

    return NextResponse.json(
      {
        success: true,
        log,
        metrics,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to trigger model retraining' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
