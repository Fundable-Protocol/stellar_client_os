import { NextRequest, NextResponse } from "next/server";
import { communityService } from "@/services/campaign-community.service";
import { CreateCommunitySpaceInput } from "@/types/campaign-community";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const spaces = communityService.getSpaces(id);
  return NextResponse.json({ campaignId: id, spaces });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { platform, name, inviteUrl, description, visibility, linkedBy, memberCount } = body;

    const input: CreateCommunitySpaceInput = {
      campaignId: id,
      platform,
      name,
      inviteUrl,
      description,
      visibility,
      linkedBy: linkedBy || "UNKNOWN",
      memberCount,
    };

    const space = communityService.createSpace(input);
    return NextResponse.json({ success: true, space }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create community space";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
