import { NextRequest, NextResponse } from "next/server";
import {
  campaignSocialSharesService,
  normalizeSharePlatform,
} from "@/services/campaign-social-shares.service";

/**
 * Record a social-share event for a campaign and/or return the current totals.
 * (Issue #1198 — the share counts feed the spotlight trending algorithm.)
 *
 * GET  /api/campaigns/[id]/share-event  → { campaignId, total, breakdown }
 * POST /api/campaigns/[id]/share-event  { platform? } → { campaignId, total, platform }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json({
    campaignId: id,
    total: campaignSocialSharesService.getTotal(id),
    breakdown: campaignSocialSharesService.getBreakdown(id),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let platform: ReturnType<typeof normalizeSharePlatform> = "other";
  try {
    const body = await request.json().catch(() => ({}));
    platform = normalizeSharePlatform(body?.platform);
  } catch {
    // empty body is fine — defaults to "other"
  }

  const total = campaignSocialSharesService.recordShare(id, platform);
  return NextResponse.json(
    { campaignId: id, total, platform },
    { status: 201 }
  );
}
