import { NextRequest, NextResponse } from "next/server";
import { followService } from "@/services/campaign-follow.service";
import { FollowNotificationPrefs } from "@/types/campaign-follow";

export const runtime = "nodejs";

/**
 * Campaign follow endpoints — Issue #942 & Issue #1010.
 *
 * GET    /api/campaigns/[id]/follow                      -> audience for the campaign
 * GET    /api/campaigns/[id]/follow?email=...            -> follow status by email
 * GET    /api/campaigns/[id]/follow?followerAddress=G... -> follow status by wallet
 * POST   /api/campaigns/[id]/follow                      -> follow / update preferences
 * DELETE /api/campaigns/[id]/follow?email=...            -> unfollow by email
 * DELETE /api/campaigns/[id]/follow?followerAddress=G... -> unfollow by wallet
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const followerAddress = searchParams.get("followerAddress");

  if (email) {
    try {
      const follow = followService.getFollow(id, email);
      return NextResponse.json({
        campaignId: id,
        following: Boolean(follow),
        follow,
        followerCount: followService.getFollowerCount(id),
      });
    } catch {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }
  }

  if (followerAddress) {
    const follow = followService.getFollow(id, followerAddress);
    return NextResponse.json({
      campaignId: id,
      following: Boolean(follow),
      follow,
      followerCount: followService.getFollowerCount(id),
    });
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
    const { email, walletAddress, followerAddress, preferences, prefs } = body ?? {};

    if (!email && !followerAddress) {
      return NextResponse.json(
        { error: "Either email or followerAddress is required" },
        { status: 400 }
      );
    }

    if (email) {
      const follow = followService.follow({
        campaignId: id,
        email,
        walletAddress,
        preferences,
      });
      return NextResponse.json(
        {
          success: true,
          following: true,
          followerCount: followService.getFollowerCount(id),
          follow,
        },
        { status: 201 }
      );
    }

    const follow = followService.follow({
      campaignId: id,
      followerAddress: followerAddress!,
      prefs: prefs as Partial<FollowNotificationPrefs> | undefined,
    });

    return NextResponse.json(
      {
        success: true,
        following: true,
        followerCount: followService.getFollowerCount(id),
        follow,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to follow campaign";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const followerAddress = searchParams.get("followerAddress");

    if (!email && !followerAddress) {
      return NextResponse.json(
        { error: "email or followerAddress is required" },
        { status: 400 }
      );
    }

    const target = email || followerAddress!;
    const removed = followService.unfollow(id, target);

    if (!removed) {
      return NextResponse.json({ error: "Follow not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      following: false,
      followerCount: followService.getFollowerCount(id),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to unfollow campaign" },
      { status: 500 }
    );
  }
}
