import { NextRequest, NextResponse } from "next/server";
import { campaignSurveyService } from "@/services/campaign-survey.service";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * GET   /api/campaigns/:id/surveys/notifications?backer=G...
 * PATCH /api/campaigns/:id/surveys/notifications (mark read)
 */
export async function GET(
  request: NextRequest,
  _context: { params: Promise<{ id: string }> }
) {
  const backer = request.nextUrl.searchParams.get("backer");
  if (!backer) {
    return NextResponse.json(
      { success: false, error: "backer address query parameter is required" },
      { status: 400, headers: NO_STORE }
    );
  }

  const notifications = campaignSurveyService.getInAppNotifications(backer);
  return NextResponse.json({ success: true, notifications }, { headers: NO_STORE });
}

export async function PATCH(
  request: NextRequest,
  _context: { params: Promise<{ id: string }> }
) {
  try {
    const body = (await request.json()) as { notificationId?: string; backerAddress?: string };
    if (!body.notificationId || !body.backerAddress) {
      return NextResponse.json(
        { success: false, error: "notificationId and backerAddress are required" },
        { status: 400, headers: NO_STORE }
      );
    }

    const updated = campaignSurveyService.markInAppNotificationRead(
      body.notificationId,
      body.backerAddress
    );
    return NextResponse.json({ success: true, updated }, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to update notification" },
      { status: 400, headers: NO_STORE }
    );
  }
}
