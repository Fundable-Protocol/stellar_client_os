import { NextRequest, NextResponse } from "next/server";
import { collaborationService } from "@/services/campaign-collaboration.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const invite = collaborationService.getInviteByToken(token);
  if (!invite) {
    return NextResponse.json({ error: "Invite token invalid or expired" }, { status: 444 });
  }
  return NextResponse.json({ invite });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const body = await request.json();
    const { name, email, stellarAddress } = body;

    const result = collaborationService.acceptInvite(token, { name, email, stellarAddress });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, collaborator: result.collaborator });
  } catch (err) {
    return NextResponse.json({ error: "Failed to accept invitation token" }, { status: 500 });
  }
}
