import { NextRequest, NextResponse } from "next/server";
import {
  AmbassadorValidationError,
  getAmbassadorProgramSummary,
  inviteAmbassador,
  listAmbassadorInvites,
} from "@/services/campaign-ambassador.service";
import { EmailService } from "@/services/email.service";
import { authorizeCampaignCreator } from "@/lib/campaign-authorization";
import { isAmbassadorTier } from "@/types/ambassador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailService = new EmailService();

/**
 * GET /api/campaigns/[id]/ambassadors
 *
 * The ambassador program dashboard: every ambassador with their pledge
 * progress, the pending invitations and the aggregated totals.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const viewerAddress = new URL(request.url).searchParams.get("viewerAddress");
    const authorization = await authorizeCampaignCreator(id, viewerAddress);
    if (!authorization.ok) {
      return NextResponse.json(
        { success: false, error: authorization.error },
        { status: authorization.status },
      );
    }

    const summary = await getAmbassadorProgramSummary(id);
    const invites = await listAmbassadorInvites(id);

    return NextResponse.json({
      success: true,
      campaignId: id,
      ...summary,
      invites,
    });
  } catch (error) {
    console.error("Error listing ambassadors:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to list ambassadors" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/campaigns/[id]/ambassadors
 *
 * Invite an ambassador by email. The invitation email carries a unique link
 * the ambassador uses to join the program.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const creatorAddress = (body.creatorAddress ?? body.actor ?? "").trim();

    const authorization = await authorizeCampaignCreator(id, creatorAddress);
    if (!authorization.ok) {
      return NextResponse.json(
        { success: false, error: authorization.error },
        { status: authorization.status },
      );
    }

    const tier = body.tier ?? "SEED";
    if (!isAmbassadorTier(tier)) {
      return NextResponse.json({ success: false, error: "Unknown ambassador tier" }, { status: 400 });
    }

    const invite = await inviteAmbassador({
      campaignId: id,
      campaignTitle: body.campaignTitle ?? "the campaign",
      email: body.email,
      name: body.name,
      tier,
      invitedBy: creatorAddress,
      invitedByName: body.invitedByName ?? "The campaign team",
      expiresInDays: body.expiresInDays ?? 14,
    });

    // Deliver the invitation by email.
    const origin = body.origin ?? process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000";
    const inviteLink = `${String(origin).replace(/\/+$/, "")}/campaigns/invite/ambassador/${invite.token}`;
    let emailDelivered = false;
    try {
      await emailService.sendEmail({
        to: invite.email,
        subject: `You've been invited to be an ambassador for ${invite.campaignTitle}`,
        html: [
          `<h2>Join the ambassador program</h2>`,
          `<p><strong>${invite.invitedByName}</strong> invited you to promote`,
          ` <strong>${invite.campaignTitle}</strong> as an ambassador.</p>`,
          `<p>You will be part of the <strong>${invite.tier}</strong> tier and earn rewards`,
          ` as you bring new backers to the campaign.</p>`,
          `<p><a href="${inviteLink}">Accept your invitation</a></p>`,
          `<p style="color:#6b7280;font-size:12px">This link expires on`,
          ` ${new Date(invite.expiresAt).toLocaleDateString("en-US")}.</p>`,
        ].join(""),
      });
      emailDelivered = true;
    } catch (error) {
      console.error("Error sending ambassador invitation email:", error);
    }

    return NextResponse.json(
      { success: true, invite, inviteLink, emailDelivered },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AmbassadorValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Error inviting ambassador:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to invite ambassador" },
      { status: 500 },
    );
  }
}
