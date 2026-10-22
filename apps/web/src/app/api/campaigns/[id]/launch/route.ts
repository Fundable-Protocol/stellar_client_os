import { NextRequest, NextResponse } from "next/server";
import { campaignPrelaunchService } from "@/services/campaign-prelaunch.service";

export const runtime = "nodejs";

/**
 * Campaign Launch & Follower Broadcast Route — Issue #1358
 *
 * POST /api/campaigns/[id]/launch
 * Transitions campaign status to ACTIVE and immediately broadcasts automated
 * email and push notifications to all waitlist followers.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let actorAddress = "creator";

    try {
      const body = await req.json();
      if (body?.actorAddress) actorAddress = body.actorAddress;
    } catch {
      // Body is optional
    }

    const result = await campaignPrelaunchService.transitionToActiveAndBroadcast(
      id,
      actorAddress
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to launch campaign";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
