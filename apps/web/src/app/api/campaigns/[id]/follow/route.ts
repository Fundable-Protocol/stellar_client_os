import { campaignFollowService } from "@/services/campaign-follow.service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const email = new URL(request.url).searchParams.get("email");
  if (!email) {
    return Response.json({ campaignId: id, followerCount: campaignFollowService.getFollowers(id).length });
  }

  try {
    const follow = campaignFollowService.getFollow(id, email);
    return Response.json({ campaignId: id, following: Boolean(follow), follow });
  } catch {
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      email?: string;
      walletAddress?: string;
      preferences?: {
        milestoneUpdates?: boolean;
        verificationUpdates?: boolean;
        completionUpdates?: boolean;
      };
    };
    const follow = campaignFollowService.follow({
      campaignId: id,
      email: body.email ?? "",
      walletAddress: body.walletAddress,
      preferences: body.preferences,
    });
    return Response.json({ success: true, following: true, follow }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to follow campaign" },
      { status: 400 },
    );
import { NextRequest, NextResponse } from "next/server";
import { followService } from "@/services/campaign-follow.service";
import { FollowNotificationPrefs } from "@/types/campaign-follow";

/**
 * Campaign follow endpoints — Issue #942 (v1).
 *
 * GET    /api/campaigns/[id]/follow                      -> audience for the campaign
 * GET    /api/campaigns/[id]/follow?followerAddress=G... -> that wallet's follow (or null)
 * POST   /api/campaigns/[id]/follow                      -> follow / update prefs
 * DELETE /api/campaigns/[id]/follow?followerAddress=G... -> unfollow
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const followerAddress = searchParams.get("followerAddress");

  if (followerAddress) {
    const follow = followService.getFollow(id, followerAddress);
    return NextResponse.json({ campaignId: id, follow });
  }

  return NextResponse.json({
    campaignId: id,
    followerCount: followService.getFollowerCount(id),
    follows: followService.getFollows(id),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { followerAddress, prefs } = body ?? {};

    if (!followerAddress) {
      return NextResponse.json(
        { error: "followerAddress is required" },
        { status: 400 }
      );
    }

    const follow = followService.follow({
      campaignId: id,
      followerAddress,
      prefs: prefs as Partial<FollowNotificationPrefs> | undefined,
    });
    return NextResponse.json(
      { success: true, followerCount: followService.getFollowerCount(id), follow },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to follow campaign";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const email = new URL(request.url).searchParams.get("email");
  if (!email) return Response.json({ error: "email is required" }, { status: 400 });

  try {
    const removed = campaignFollowService.unfollow(id, email);
    if (!removed) return Response.json({ error: "Follow not found" }, { status: 404 });
    return Response.json({ success: true, following: false });
  } catch {
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const followerAddress = searchParams.get("followerAddress");

    if (!followerAddress) {
      return NextResponse.json(
        { error: "followerAddress is required" },
        { status: 400 }
      );
    }

    const removed = followService.unfollow(id, followerAddress);
    if (!removed) {
      return NextResponse.json({ error: "Follow not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      followerCount: followService.getFollowerCount(id),
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to unfollow campaign" }, { status: 500 });
  }
}
