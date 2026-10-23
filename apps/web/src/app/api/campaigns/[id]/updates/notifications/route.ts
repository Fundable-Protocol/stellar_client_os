import { NextRequest, NextResponse } from "next/server";
import {
  listInAppNotifications,
  markAllInAppNotificationsRead,
  markInAppNotificationRead,
} from "@/services/campaign-update-notification.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns/[id]/updates/notifications
 *
 * The in-app notifications of a recipient for this campaign, newest first.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const recipientId = new URL(request.url).searchParams.get("recipientId")?.trim();
    if (!recipientId) {
      return NextResponse.json(
        { success: false, error: "recipientId is required" },
        { status: 400 },
      );
    }

    const notifications = await listInAppNotifications(recipientId);
    const forCampaign = notifications.filter(
      (notification) => notification.campaignId === id || !notification.campaignId,
    );

    return NextResponse.json({
      success: true,
      notifications: forCampaign,
      unreadCount: forCampaign.filter((notification) => !notification.read).length,
    });
  } catch (error) {
    console.error("Error listing in-app notifications:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list notifications",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/campaigns/[id]/updates/notifications
 *
 * Mark a single in-app notification — or every notification of the recipient —
 * as read.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const recipientId = (body.recipientId ?? "").trim();
    if (!recipientId) {
      return NextResponse.json(
        { success: false, error: "recipientId is required" },
        { status: 400 },
      );
    }

    if (body.notificationId) {
      // Only notifications that belong to this campaign can be marked read.
      const owned = (await listInAppNotifications(recipientId)).find(
        (notification) => notification.id === body.notificationId && notification.campaignId === id,
      );
      if (!owned) {
        return NextResponse.json({ success: false, error: "Notification not found" }, { status: 404 });
      }
      const updated = await markInAppNotificationRead(body.notificationId, recipientId);
      return NextResponse.json({ success: updated });
    }

    const updated = await markAllInAppNotificationsRead(recipientId);
    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error("Error updating in-app notifications:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update notifications",
      },
      { status: 500 },
    );
  }
}
