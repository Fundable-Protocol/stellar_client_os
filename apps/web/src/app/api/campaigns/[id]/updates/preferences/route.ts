import { NextRequest, NextResponse } from "next/server";
import {
  CampaignUpdatePreferenceError,
  getBackerUpdatePreference,
  getCampaignUpdatePreferenceDataSource,
  setBackerUpdatePreference,
} from "@/services/campaign-update-notification.service";
import { resolveCampaignCreator, sameAddress } from "@/lib/campaign-authorization";
import type { CampaignUpdateNotificationMode } from "@/types/campaign-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_MODES: CampaignUpdateNotificationMode[] = [
  "instant",
  "daily_digest",
  "weekly_digest",
  "off",
];

/**
 * GET /api/campaigns/[id]/updates/preferences
 *
 * Read the notification preference of a backer. When `backerId` is omitted
 * the creator sees every preference registered for the campaign.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const searchParams = new URL(request.url).searchParams;
    const backerId = searchParams.get("backerId")?.trim();
    const preferences = getCampaignUpdatePreferenceDataSource();

    if (!backerId) {
      const creator = await resolveCampaignCreator(id);
      const viewerAddress = searchParams.get("viewerAddress");
      if (creator && !sameAddress(creator, viewerAddress)) {
        return NextResponse.json(
          { success: false, error: "Only the campaign creator may list preferences." },
          { status: 403 },
        );
      }
      const all = await preferences.getForCampaign(id);
      return NextResponse.json({ success: true, preferences: all });
    }

    const preference = await getBackerUpdatePreference(id, backerId);
    return NextResponse.json({ success: true, preference });
  } catch (error) {
    console.error("Error reading campaign update preferences:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to read preferences",
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/campaigns/[id]/updates/preferences
 *
 * Store the notification preference of a backer: instant email, a daily or
 * weekly digest, or no email at all — plus whether the updates should also
 * appear in the in-app notification centre.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const mode = body.mode as CampaignUpdateNotificationMode;

    if (!VALID_MODES.includes(mode)) {
      return NextResponse.json(
        { success: false, error: `mode must be one of ${VALID_MODES.join(", ")}` },
        { status: 400 },
      );
    }

    const preference = await setBackerUpdatePreference({
      campaignId: id,
      backerId: (body.backerId ?? "").trim(),
      email: body.email,
      mode,
      inAppEnabled:
        typeof body.inAppEnabled === "boolean" ? body.inAppEnabled : undefined,
      timezone: body.timezone,
    });

    return NextResponse.json({ success: true, preference });
  } catch (error) {
    if (error instanceof CampaignUpdatePreferenceError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Error saving campaign update preferences:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save preferences",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/campaigns/[id]/updates/preferences
 *
 * Alias of PUT so the preference can also be stored with a form-style request.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return PUT(request, { params });
}
