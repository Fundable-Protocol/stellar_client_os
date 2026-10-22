import { NextRequest, NextResponse } from "next/server";
import { campaignPrelaunchService } from "@/services/campaign-prelaunch.service";

export const runtime = "nodejs";

/**
 * Campaign Pre-Launch Waitlist API — Issue #1358
 *
 * POST   /api/campaigns/[id]/waitlist -> Subscribe email to waitlist
 * GET    /api/campaigns/[id]/waitlist -> Get follower count & social proof stats
 * DELETE /api/campaigns/[id]/waitlist -> Unsubscribe
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { email, walletAddress } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email address is required" },
        { status: 400 }
      );
    }

    const result = campaignPrelaunchService.subscribe({
      campaignId: id,
      email,
      walletAddress,
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: result.isNew ? 201 : 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to subscribe to waitlist";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const stats = campaignPrelaunchService.getStats(id);

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch waitlist stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "email query parameter is required" },
        { status: 400 }
      );
    }

    const removed = campaignPrelaunchService.unsubscribe(id, email);
    if (!removed) {
      return NextResponse.json(
        { error: "Subscriber not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { unsubscribed: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unsubscribe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
