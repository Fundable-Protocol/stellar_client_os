import { NextRequest, NextResponse } from 'next/server';
import { CampaignVerificationAuditService } from '@/services/campaign-verification-audit.service';
import { CampaignPushNotificationService } from '@/services/campaign-push-notification.service';
import type { VerificationActivityType } from '@/types/campaign-verification-audit';

const pushService = new CampaignPushNotificationService();
const auditService = new CampaignVerificationAuditService({ pushService });

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Campaign id is required' }, { status: 400 });
    }

    const trail = await auditService.getAuditTrail(id);
    return NextResponse.json({ success: true, trail }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch verification audit trail';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Campaign id is required' }, { status: 400 });
    }

    const body = await req.json();
    const { activityType, actor, details, txHash, campaignTitle } = body;

    const validActivityTypes: VerificationActivityType[] = [
      'submitted_for_review',
      'verifier_comments',
      'photo_uploaded',
      'approved',
      'rejected',
    ];

    if (!activityType || !validActivityTypes.includes(activityType)) {
      return NextResponse.json(
        {
          error: `activityType must be one of: ${validActivityTypes.join(', ')}`,
        },
        { status: 400 }
      );
    }

    if (!actor || !details) {
      return NextResponse.json(
        { error: 'actor and details are required' },
        { status: 400 }
      );
    }

    const entry = await auditService.logActivity({
      campaignId: id,
      activityType,
      actor,
      details,
      txHash,
      campaignTitle,
    });

    return NextResponse.json({ success: true, entry }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to record verification activity';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
