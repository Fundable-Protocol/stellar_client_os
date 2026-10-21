export const runtime = "nodejs";

import {
  cancelScheduledPost,
  listScheduledPosts,
  rescheduleSocialPost,
  scheduleSocialPost,
  type SchedulablePlatform,
  type ScheduledPostStatus,
} from "@/services/campaign-social-scheduler.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const creatorAddress = url.searchParams.get("creator") ?? undefined;
  const status = (url.searchParams.get("status") as ScheduledPostStatus | null) ?? undefined;
  const monthKey = url.searchParams.get("month") ?? undefined;

  const posts = listScheduledPosts({
    campaignId: id,
    creatorAddress,
    status,
    monthKey,
  });

  return Response.json(
    { posts },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      campaignTitle?: string;
      creatorAddress?: string;
      platforms?: SchedulablePlatform[];
      content?: string;
      hashtags?: string[];
      campaignUrl?: string;
      mediaUrl?: string;
      scheduledFor?: string;
    };

    const result = scheduleSocialPost({
      campaignId: id,
      campaignTitle: body.campaignTitle || "Campaign Promotion",
      creatorAddress: body.creatorAddress || "GD6W...X892",
      platforms: body.platforms || [],
      content: body.content || "",
      hashtags: body.hashtags,
      campaignUrl: body.campaignUrl,
      mediaUrl: body.mediaUrl,
      scheduledFor: body.scheduledFor || "",
    });

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ post: result.post }, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      postId?: string;
      scheduledFor?: string;
    };
    if (!body.postId || !body.scheduledFor) {
      return Response.json(
        { error: "postId and scheduledFor are required" },
        { status: 400 },
      );
    }
    const result = rescheduleSocialPost(body.postId, body.scheduledFor);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json({ post: result.post }, { status: 200 });
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const postId = url.searchParams.get("postId");
  if (!postId) {
    return Response.json(
      { error: "postId query parameter is required" },
      { status: 400 },
    );
  }
  const cancelled = cancelScheduledPost(postId);
  if (!cancelled) {
    return Response.json({ error: "Scheduled post not found" }, { status: 404 });
  }
  return Response.json({ post: cancelled }, { status: 200 });
}
