import { NextRequest, NextResponse } from "next/server";
import {
  getCreatorBlogDataSource,
  validateBlogPost,
  generateExcerpt,
  type CreatorBlogPost,
} from "@/services/creator-blog.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/creators/[address]/blog
 * Fetch all blog posts for a creator
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const searchParams = request.nextUrl.searchParams;

    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");
    const status = searchParams.get("status") as "draft" | "published" | null;
    const campaignId = searchParams.get("campaignId");
    const tags = searchParams.get("tags")?.split(",").filter(Boolean);

    const dataSource = getCreatorBlogDataSource();

    const posts = await dataSource.getBlogPosts({
      filter: {
        creatorAddress: address,
        status: status || undefined,
        campaignId: campaignId || undefined,
        tags: tags || undefined,
      },
      limit,
      offset,
    });

    const totalCount = await dataSource.getPostCount({
      creatorAddress: address,
      status: status || undefined,
      campaignId: campaignId || undefined,
      tags: tags || undefined,
    });

    return NextResponse.json({
      success: true,
      posts,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching creator blog posts:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch blog posts",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/creators/[address]/blog
 * Create a new blog post
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const body = await request.json();

    // Validate input
    const validation = validateBlogPost({ ...body, creatorAddress: address });
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const dataSource = getCreatorBlogDataSource();

    // Generate excerpt if not provided
    const excerpt = body.excerpt || generateExcerpt(body.content);

    const newPost: CreatorBlogPost = {
      id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      creatorAddress: address,
      campaignId: body.campaignId || undefined,
      title: body.title.trim(),
      content: body.content.trim(),
      excerpt,
      publishedAt: Date.now(),
      status: body.status || "published",
      tags: body.tags || [],
      coverImageUrl: body.coverImageUrl || undefined,
    };

    const savedPost = await dataSource.saveBlogPost(newPost);

    return NextResponse.json(
      {
        success: true,
        post: savedPost,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating blog post:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create blog post",
      },
      { status: 500 }
    );
  }
}
