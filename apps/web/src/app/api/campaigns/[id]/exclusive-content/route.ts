import { NextRequest, NextResponse } from "next/server";
import { exclusiveContentService } from "@/services/campaign-exclusive-content.service";
import {
  ExclusiveContentAttachmentInput,
  ExclusiveContentPostType,
  isExclusivePostType,
} from "@/types/campaign-exclusive-content";

/**
 * Backer-only exclusive content API route (#1267).
 *
 *  GET    /api/campaigns/:id/exclusive-content?viewer=G...&creator=G...
 *         Returns pledge gate status and the exclusive content feed (unlocked
 *         for verified backers/creators, redacted with teaser for non-backers).
 *  POST   /api/campaigns/:id/exclusive-content
 *         Creator publishes a rich-text post or file upload to the backer-only area.
 *  DELETE /api/campaigns/:id/exclusive-content?postId=...&creatorAddress=...
 *         Creator deletes an exclusive post.
 */

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const viewerAddress = url.searchParams.get("viewer") ?? undefined;
  const creatorAddress = url.searchParams.get("creator") ?? undefined;

  const feed = exclusiveContentService.getFeed(id, {
    viewerAddress,
    creatorAddress,
  });
  return NextResponse.json(feed, { headers: NO_STORE });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      creatorAddress?: string;
      title?: string;
      teaser?: string;
      postType?: unknown;
      richTextContent?: string;
      attachments?: ExclusiveContentAttachmentInput[];
      minPledgeAmount?: string;
    };

    if (!body.creatorAddress?.trim()) {
      return NextResponse.json(
        { error: "creatorAddress is required" },
        { status: 400, headers: NO_STORE },
      );
    }
    if (!body.title?.trim()) {
      return NextResponse.json(
        { error: "Post title is required" },
        { status: 400, headers: NO_STORE },
      );
    }
    if (body.postType !== undefined && !isExclusivePostType(body.postType)) {
      return NextResponse.json(
        { error: "postType must be RICH_TEXT or FILE" },
        { status: 400, headers: NO_STORE },
      );
    }

    const result = exclusiveContentService.publishPost({
      campaignId: id,
      creatorAddress: body.creatorAddress,
      title: body.title,
      teaser: body.teaser,
      postType: body.postType as ExclusiveContentPostType | undefined,
      richTextContent: body.richTextContent,
      attachments: body.attachments,
      minPledgeAmount: body.minPledgeAmount,
    });

    if (!result.ok) {
      const isForbidden = result.error.toLowerCase().includes("only the campaign creator");
      return NextResponse.json(
        { error: result.error },
        { status: isForbidden ? 403 : 400, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      { success: true, post: result.value },
      { status: 201, headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400, headers: NO_STORE },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const postId = url.searchParams.get("postId") ?? "";
  const creatorAddress = url.searchParams.get("creatorAddress") ?? "";

  if (!postId.trim() || !creatorAddress.trim()) {
    return NextResponse.json(
      { error: "postId and creatorAddress query parameters are required" },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = exclusiveContentService.deletePost({
    campaignId: id,
    postId,
    creatorAddress,
  });

  if (!result.ok) {
    const status = result.error.toLowerCase().includes("only the campaign creator")
      ? 403
      : result.error.toLowerCase().includes("not found")
        ? 404
        : 400;
    return NextResponse.json(
      { error: result.error },
      { status, headers: NO_STORE },
    );
  }

  return NextResponse.json(
    { success: true, deleted: true },
    { headers: NO_STORE },
  );
}
