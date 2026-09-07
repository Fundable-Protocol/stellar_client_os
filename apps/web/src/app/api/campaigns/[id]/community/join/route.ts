import { NextRequest, NextResponse } from "next/server";
import { communityService } from "@/services/campaign-community.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { spaceId, memberAddress } = body;

    if (!spaceId || !memberAddress) {
      return NextResponse.json({ error: "spaceId and memberAddress are required" }, { status: 400 });
    }

    const result = communityService.joinSpace({ spaceId, memberAddress });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ success: true, membership: result.membership }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to join community space" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get("spaceId");
    const memberAddress = searchParams.get("memberAddress");

    if (!spaceId || !memberAddress) {
      return NextResponse.json({ error: "spaceId and memberAddress are required" }, { status: 400 });
    }

    const left = communityService.leaveSpace(spaceId, memberAddress);
    if (!left) {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to leave community space" }, { status: 500 });
  }
}
