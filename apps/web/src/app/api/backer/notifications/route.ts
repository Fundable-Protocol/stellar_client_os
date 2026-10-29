import { NextRequest, NextResponse } from "next/server";
import { backerNotificationService } from "@/services/backer-notification.service";
import { CAMPAIGN_NOTIFICATION_EVENTS, NOTIFICATION_CHANNELS } from "@/types/backer-notification-preferences";

export const runtime = "nodejs";

/**
 * GET /api/backer/notifications?backerAddress=GBACKER...&campaignId=camp-101
 * If campaignId is provided: returns single campaign preferences for that backer.
 * If campaignId is omitted: returns all campaign preferences for that backer.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const backerAddress = searchParams.get("backerAddress");
  const campaignId = searchParams.get("campaignId");

  if (!backerAddress) {
    return NextResponse.json({ error: "backerAddress parameter is required" }, { status: 400 });
  }

  try {
    if (campaignId) {
      const pref = await backerNotificationService.getPreferences(backerAddress, campaignId);
      return NextResponse.json(pref);
    } else {
      const prefs = await backerNotificationService.getBackerCampaignPreferences(backerAddress);
      return NextResponse.json({ preferences: prefs });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch preferences" }, { status: 500 });
  }
}

/**
 * POST /api/backer/notifications
 * Body: {
 *   backerAddress: string,
 *   campaignId: string,
 *   campaignTitle?: string,
 *   preferences: EventChannelPreferences,
 *   email?: string,
 *   pushEndpoint?: string
 * }
 */
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { backerAddress, campaignId, campaignTitle, preferences, email, pushEndpoint } = body;

  if (!backerAddress || !campaignId) {
    return NextResponse.json({ error: "backerAddress and campaignId are required" }, { status: 400 });
  }

  try {
    const updated = await backerNotificationService.updateCampaignPreference({
      backerAddress,
      campaignId,
      campaignTitle,
      preferences: preferences || {},
      email,
      pushEndpoint,
    });
    return NextResponse.json(updated, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update preferences" }, { status: 500 });
  }
}
