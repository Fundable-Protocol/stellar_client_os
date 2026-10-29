import { NextRequest, NextResponse } from "next/server";
import { backerNotificationService } from "@/services/backer-notification.service";
import { BulkUpdatePreferencesInput, BackedCampaignSummary } from "@/types/backer-notification-preferences";

export const runtime = "nodejs";

/**
 * POST /api/backer/notifications/bulk
 * Body: {
 *   backerAddress: string,
 *   campaignIds?: string[],
 *   preferences: Partial<Record<CampaignNotificationEvent, Partial<ChannelPreferences>>>,
 *   email?: string,
 *   pushEndpoint?: string,
 *   backedCampaigns?: BackedCampaignSummary[]
 * }
 */
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { backerAddress, campaignIds, preferences, email, pushEndpoint, backedCampaigns } = body;

  if (!backerAddress) {
    return NextResponse.json({ error: "backerAddress is required" }, { status: 400 });
  }

  try {
    const input: BulkUpdatePreferencesInput = {
      backerAddress,
      campaignIds,
      preferences: preferences || {},
      email,
      pushEndpoint,
    };

    const results = await backerNotificationService.bulkUpdatePreferences(
      input,
      backedCampaigns || []
    );

    return NextResponse.json({ success: true, count: results.length, preferences: results });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to bulk update preferences" },
      { status: 500 }
    );
  }
}
