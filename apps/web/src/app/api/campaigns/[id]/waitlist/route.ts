import { NextRequest, NextResponse } from "next/server";
import {
  CampaignWaitlistValidationError,
  countCampaignWaitlist,
  joinCampaignWaitlist,
} from "@/services/campaign-waitlist.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns/[id]/waitlist
 *
 * The number of people waiting for the campaign to launch.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const count = await countCampaignWaitlist(id);
    return NextResponse.json({ success: true, campaignId: id, count });
  } catch (error) {
    console.error("Error reading campaign waitlist:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to read waitlist" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/campaigns/[id]/waitlist
 *
 * Join the waitlist of a not-yet-launched campaign.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const entry = await joinCampaignWaitlist(
      id,
      body.email,
      body.notifyOnLaunch !== false,
    );
    const count = await countCampaignWaitlist(id);
    return NextResponse.json(
      { success: true, campaignId: id, entry, count },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CampaignWaitlistValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Error joining campaign waitlist:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to join waitlist" },
      { status: 500 },
    );
  }
}
