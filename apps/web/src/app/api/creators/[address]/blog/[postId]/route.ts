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
 * GET /api/creators/[address]/blog/[postId]
 * Get a specific blog post
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string; postId: string }> }
) {
  try {
    const { postId } = await params;
    const dataSource = getCreatorBlogDataSource();

    const post = await dataSource.getBlogPostById(postId);

    if (!post) {
      return NextResponse.json(
        { success: false, error: "Blog post not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      post,
    });
  } catch (error) {
    console.error("Error fetching blog post:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch blog post",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/creators/[address]/blog/[postId]
 * Update an existing blog post
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ address: string; postId: string }> }
) {
  try {
    const { address, postId } = await params;
    const body = await request.json();
    const dataSource = getCreatorBlogDataSource();

    const existingPost = await dataSource.getBlogPostById(postId);

    if (!existingPost) {
      return NextResponse.json(
        { success: false, error: "Blog post not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (existingPost.creatorAddress !== address) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Validate input
    const validation = validateBlogPost({ ...body, creatorAddress: address });
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const updatedPost: CreatorBlogPost = {
      ...existingPost,
      title: body.title?.trim() || existingPost.title,
      content: body.content?.trim() || existingPost.content,
      excerpt: body.excerpt || generateExcerpt(body.content || existingPost.content),
      updatedAt: Date.now(),
      status: body.status || existingPost.status,
      tags: body.tags || existingPost.tags,
      coverImageUrl: body.coverImageUrl !== undefined ? body.coverImageUrl : existingPost.coverImageUrl,
      campaignId: body.campaignId !== undefined ? body.campaignId : existingPost.campaignId,
    };

    const savedPost = await dataSource.saveBlogPost(updatedPost);

    return NextResponse.json({
      success: true,
      post: savedPost,
    });
  } catch (error) {
    console.error("Error updating blog post:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update blog post",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/creators/[address]/blog/[postId]
 * Delete a blog post
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ address: string; postId: string }> }
) {
  try {
    const { address, postId } = await params;
    const dataSource = getCreatorBlogDataSource();

    const existingPost = await dataSource.getBlogPostById(postId);

    if (!existingPost) {
      return NextResponse.json(
        { success: false, error: "Blog post not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (existingPost.creatorAddress !== address) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      );
    }

    const deleted = await dataSource.deleteBlogPost(postId);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Failed to delete blog post" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Blog post deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting blog post:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete blog post",
      },
      { status: 500 }
    );
  }
}
