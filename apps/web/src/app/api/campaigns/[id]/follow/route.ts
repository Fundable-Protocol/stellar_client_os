import { NextRequest, NextResponse } from "next/server";
import {
  campaignFollowService,
  followService,
} from "@/services/campaign-follow.service";
import type { FollowNotificationPrefs } from "@/types/campaign-follow";

export const runtime = "nodejs";

/**
 * Campaign follow endpoints.
 *
 * GET    /api/campaigns/[id]/follow                          -> audience for the campaign
 * GET    /api/campaigns/[id]/follow?followerAddress=G...    -> that wallet's follow (or null)
 * GET    /api/campaigns/[id]/follow?email=a@b.com            -> that email's follow (or null)
 * POST   /api/campaigns/[id]/follow                          -> follow / update prefs
 * DELETE /api/campaigns/[id]/follow?followerAddress=G...    -> unfollow
 * DELETE /api/campaigns/[id]/follow?email=a@b.com            -> unfollow
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const followerAddress = searchParams.get("followerAddress");
  const email = searchParams.get("email");

  if (followerAddress) {
    const follow = followService.getFollow(id, followerAddress);
    return NextResponse.json({ campaignId: id, follow });
  }

  if (email) {
    try {
      const follow = campaignFollowService.getFollow(id, email);
      return NextResponse.json({ campaignId: id, following: Boolean(follow), follow });
    } catch {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }
  }

  return NextResponse.json({
    campaignId: id,
    followerCount: followService.getFollowerCount(id),
    follows: followService.getFollows(id),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) ?? {};
    const { followerAddress, email, walletAddress, prefs, preferences } = body;

    if (followerAddress) {
      const follow = followService.follow({
        campaignId: id,
        followerAddress,
        prefs: prefs as Partial<FollowNotificationPrefs> | undefined,
      });
      return NextResponse.json(
        { success: true, following: true, followerCount: followService.getFollowerCount(id), follow },
        { status: 201 },
      );
    }

    const follow = campaignFollowService.follow({
      campaignId: id,
      email: email ?? "",
      walletAddress,
      preferences,
    });
    return NextResponse.json({ success: true, following: true, follow }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to follow campaign" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const followerAddress = searchParams.get("followerAddress");
  const email = searchParams.get("email");

  if (followerAddress) {
    const removed = followService.unfollow(id, followerAddress);
    if (!removed) {
      return NextResponse.json({ error: "Follow not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      following: false,
      followerCount: followService.getFollowerCount(id),
    });
  }

  if (!email) {
    return NextResponse.json(
      { error: "email or followerAddress is required" },
      { status: 400 },
    );
  }

  try {
    const removed = campaignFollowService.unfollow(id, email);
    if (!removed) {
      return NextResponse.json({ error: "Follow not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, following: false });
  } catch {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
}
