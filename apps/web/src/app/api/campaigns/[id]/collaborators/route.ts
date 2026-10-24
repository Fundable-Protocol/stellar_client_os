import { NextRequest, NextResponse } from "next/server";
import { collaborationService } from "@/services/campaign-collaboration.service";
import { getCampaign } from "@/services/campaign.service";
import { EmailService } from "@/services/email.service";
import {
  INVITABLE_ROLES,
  type CoCreatorRole,
} from "@/types/collaboration";

const emailService = new EmailService();

function isInvitableRole(role: unknown): role is CoCreatorRole {
  return typeof role === "string" && (INVITABLE_ROLES as string[]).includes(role);
}

/**
 * Resolve the campaign owner (creator) address so the permission check can
 * treat the creator as the implicit OWNER even when they are not stored in the
 * collaborators list.
 */
async function resolveOwner(campaignId: string): Promise<string | undefined> {
  const campaign = await getCampaign(campaignId);
  return campaign?.creator;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const collaborators = collaborationService.getCollaborators(id);
  return NextResponse.json({ campaignId: id, collaborators });
}

/**
 * Create an invitation token for a new co-manager and, when an email address is
 * supplied, deliver the invitation by email. (Issue #1197 — invitation via
 * email.)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const {
      role,
      invitedBy,
      invitedByName,
      inviteeEmail,
      expiresInDays,
      campaignTitle,
      origin,
    } = body;

    // Only non-owner roles may be granted through an invitation.
    if (!isInvitableRole(role)) {
      return NextResponse.json(
        { error: "Invalid role. OWNER cannot be granted via invitation." },
        { status: 400 }
      );
    }

    // Permission check: only addresses that can manage collaborators may invite.
    const ownerAddress = await resolveOwner(id);
    const actor = invitedBy || ownerAddress;
    if (
      actor &&
      !collaborationService.checkPermission(id, actor, "canManageCollaborators", ownerAddress)
    ) {
      return NextResponse.json(
        { error: "You do not have permission to invite collaborators." },
        { status: 403 }
      );
    }

    const invite = collaborationService.createInviteToken({
      campaignId: id,
      campaignTitle: campaignTitle || "Campaign",
      role,
      invitedBy: invitedBy || "UNKNOWN",
      invitedByName: invitedByName || "Campaign Admin",
      inviteeEmail,
      expiresInDays: expiresInDays || 7,
    });

    // Deliver the invitation by email when an address is provided.
    if (inviteeEmail) {
      const appOrigin =
        origin || process.env.NEXT_PUBLIC_APP_ORIGIN || "http://localhost:3000";
      const inviteLink = `${appOrigin}/campaigns/invite/${invite.token}`;
      await emailService.sendEmail({
        to: inviteeEmail,
        subject: `You've been invited to co-manage "${invite.campaignTitle}"`,
        html: [
          `<h2>You're invited to collaborate on Fundable</h2>`,
          `<p><strong>${invite.invitedByName}</strong> has invited you to join`,
          ` the campaign "<strong>${invite.campaignTitle}</strong>" as a`,
          ` <strong>${invite.role}</strong>.</p>`,
          `<p><a href="${inviteLink}">Accept your invitation</a></p>`,
          `<p style="color:#6b7280;font-size:12px">This link expires in`,
          ` ${invite.expiresInDays ?? 7} days. If you did not expect this`,
          ` invitation, you can ignore this email.</p>`,
        ].join(""),
      });
    }

    return NextResponse.json({ success: true, invite }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create collaborator invite" },
      { status: 500 }
    );
  }
}

/**
 * Remove a co-manager. Requires the `canManageCollaborators` permission.
 * The OWNER can never be removed.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { collaboratorId, actor } = body;
    if (!collaboratorId) {
      return NextResponse.json({ error: "collaboratorId is required" }, { status: 400 });
    }

    const ownerAddress = await resolveOwner(id);
    if (
      actor &&
      !collaborationService.checkPermission(id, actor, "canManageCollaborators", ownerAddress)
    ) {
      return NextResponse.json(
        { error: "You do not have permission to remove collaborators." },
        { status: 403 }
      );
    }

    const removed = collaborationService.removeCollaborator(id, collaboratorId);
    return NextResponse.json({ success: removed });
  } catch (err) {
    return NextResponse.json({ error: "Failed to remove collaborator" }, { status: 500 });
  }
}

/**
 * Change a co-manager's role. Requires the `canManageCollaborators` permission.
 * The OWNER's role cannot be changed, and you cannot grant OWNER via this route.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { collaboratorId, newRole, actor } = body;
    if (!collaboratorId) {
      return NextResponse.json({ error: "collaboratorId is required" }, { status: 400 });
    }
    if (!isInvitableRole(newRole)) {
      return NextResponse.json(
        { error: "Invalid role. OWNER cannot be assigned via this route." },
        { status: 400 }
      );
    }

    const ownerAddress = await resolveOwner(id);
    if (
      actor &&
      !collaborationService.checkPermission(id, actor, "canManageCollaborators", ownerAddress)
    ) {
      return NextResponse.json(
        { error: "You do not have permission to change collaborator roles." },
        { status: 403 }
      );
    }

    const updated = collaborationService.updateRole(id, collaboratorId, newRole);
    return NextResponse.json({ success: updated });
  } catch (err) {
    return NextResponse.json({ error: "Failed to update collaborator role" }, { status: 500 });
  }
}
