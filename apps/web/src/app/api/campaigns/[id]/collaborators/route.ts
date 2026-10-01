import { NextRequest, NextResponse } from "next/server";
import { collaborationService } from "@/services/campaign-collaboration.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const collaborators = collaborationService.getCollaborators(id);
  return NextResponse.json({ campaignId: id, collaborators });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { role, invitedBy, expiresInDays, campaignTitle } = body;

    const invite = collaborationService.createInviteToken({
      campaignId: id,
      campaignTitle: campaignTitle || "Campaign",
      role: role || "CO_CREATOR",
      invitedBy: invitedBy || "UNKNOWN",
      invitedByName: "Campaign Admin",
      expiresInDays: expiresInDays || 7,
    });

    return NextResponse.json({ success: true, invite }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to create collaborator invite" }, { status: 500 });
  }
}
