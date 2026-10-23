import { NextRequest, NextResponse } from "next/server";
import {
  acceptAmbassadorInvite,
  getAmbassadorInvite,
} from "@/services/campaign-ambassador.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ambassadors/invite/[token]
 *
 * Look up an ambassador invitation so the invite page can show the campaign
 * and the tier the ambassador is invited to.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const invite = await getAmbassadorInvite(token);
    if (!invite) {
      return NextResponse.json(
        { success: false, error: "This invitation is invalid or has expired." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      invite: {
        token: invite.token,
        campaignId: invite.campaignId,
        campaignTitle: invite.campaignTitle,
        name: invite.name,
        email: invite.email,
        tier: invite.tier,
        invitedByName: invite.invitedByName,
        expiresAt: invite.expiresAt,
        status: invite.status,
      },
    });
  } catch (error) {
    console.error("Error fetching ambassador invite:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch invitation" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/ambassadors/invite/[token]
 *
 * Accept an invitation and join the ambassador program.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const body = await request.json();
    const result = await acceptAmbassadorInvite({
      token,
      name: body.name ?? "",
      email: body.email,
      stellarAddress: body.stellarAddress,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      ambassador: result.ambassador,
      referralCode: result.ambassador?.referralCode,
    });
  } catch (error) {
    console.error("Error accepting ambassador invite:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to accept invitation" },
      { status: 500 },
    );
  }
}
