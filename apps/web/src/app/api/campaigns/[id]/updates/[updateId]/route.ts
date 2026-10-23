import { NextRequest, NextResponse } from "next/server";
import {
  deleteCampaignUpdate,
  getCampaignUpdate,
  getCampaignUpdateDataSource,
  updateCampaignUpdate,
  CampaignUpdateValidationError,
} from "@/services/campaign-update.service";
import { authorizeCampaignCreator } from "@/lib/campaign-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns/[id]/updates/[updateId]
 *
 * Fetch a single update. Drafts are only visible to the campaign creator.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; updateId: string }> },
) {
  const { id, updateId } = await params;
  try {
    const update = await getCampaignUpdate(updateId);
    if (!update || update.campaignId !== id) {
      return NextResponse.json({ success: false, error: "Update not found" }, { status: 404 });
    }

    if (update.status !== "published") {
      const viewerAddress = new URL(request.url).searchParams.get("viewerAddress");
      const authorization = await authorizeCampaignCreator(id, viewerAddress);
      if (!authorization.ok) {
        return NextResponse.json(
          { success: false, error: "Update not found" },
          { status: 404 },
        );
      }
    }

    return NextResponse.json({ success: true, update });
  } catch (error) {
    console.error("Error fetching campaign update:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch update" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/campaigns/[id]/updates/[updateId]
 *
 * Edit an update. Only the campaign creator may edit, and published updates
 * stay published — use the publish route to (re)announce an update.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; updateId: string }> },
) {
  const { id, updateId } = await params;
  try {
    const body = await request.json();
    const creatorAddress = (body.creatorAddress ?? body.actor ?? "").trim();

    const authorization = await authorizeCampaignCreator(id, creatorAddress);
    if (!authorization.ok) {
      return NextResponse.json(
        { success: false, error: authorization.error },
        { status: authorization.status },
      );
    }

    const existing = await getCampaignUpdate(updateId);
    if (!existing || existing.campaignId !== id) {
      return NextResponse.json({ success: false, error: "Update not found" }, { status: 404 });
    }

    const update = await updateCampaignUpdate(
      updateId,
      {
        title: body.title,
        bodyMarkdown: body.bodyMarkdown ?? body.body,
        excerpt: body.excerpt,
        imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls : undefined,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        visibility:
          body.visibility === "backers_only" || body.visibility === "public"
            ? body.visibility
            : undefined,
        notifyBackers:
          typeof body.notifyBackers === "boolean" ? body.notifyBackers : undefined,
        notificationMode:
          body.notificationMode === "daily_digest" ||
          body.notificationMode === "weekly_digest" ||
          body.notificationMode === "off" ||
          body.notificationMode === "instant"
            ? body.notificationMode
            : undefined,
      },
      getCampaignUpdateDataSource(),
    );

    return NextResponse.json({ success: true, update });
  } catch (error) {
    if (error instanceof CampaignUpdateValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Error updating campaign update:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update update" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/campaigns/[id]/updates/[updateId]
 *
 * Remove an update. Only the campaign creator may do so.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; updateId: string }> },
) {
  const { id, updateId } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const creatorAddress = (body.creatorAddress ?? body.actor ?? "").trim();

    const authorization = await authorizeCampaignCreator(id, creatorAddress);
    if (!authorization.ok) {
      return NextResponse.json(
        { success: false, error: authorization.error },
        { status: authorization.status },
      );
    }

    const existing = await getCampaignUpdate(updateId);
    if (!existing || existing.campaignId !== id) {
      return NextResponse.json({ success: false, error: "Update not found" }, { status: 404 });
    }

    const deleted = await deleteCampaignUpdate(updateId);
    return NextResponse.json({ success: deleted });
  } catch (error) {
    console.error("Error deleting campaign update:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete update" },
      { status: 500 },
    );
  }
}
