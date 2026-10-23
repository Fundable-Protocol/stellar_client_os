import { NextRequest, NextResponse } from "next/server";
import {
  createCampaignUpdate,
  getCampaignUpdateDataSource,
  CampaignUpdateValidationError,
} from "@/services/campaign-update.service";
import {
  publishCampaignUpdateWithNotifications,
  resolveUpdateRecipients,
  type BackerRecipient,
} from "@/services/campaign-update-publish.service";
import { EmailService } from "@/services/email.service";
import { authorizeCampaignCreator, resolveCampaignCreator, sameAddress } from "@/lib/campaign-authorization";
import type {
  CampaignUpdateNotificationMode,
  CampaignUpdateStatus,
  CampaignUpdateVisibility,
} from "@/types/campaign-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailService = new EmailService();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * GET /api/campaigns/[id]/updates
 *
 * The chronological update feed of a campaign.
 *
 * Published updates are public by default. Drafts and archived updates are
 * only returned to the campaign creator, and `backers_only` updates are only
 * returned when the caller identifies itself as a backer (`viewerAddress`).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const searchParams = new URL(request.url).searchParams;
    const limit = parseLimit(searchParams.get("limit"));
    const offset = Math.max(0, Number.parseInt(searchParams.get("offset") ?? "0", 10) || 0);
    const orderParam = searchParams.get("order");
    const order: "chronological" | "reverse_chronological" =
      orderParam === "reverse_chronological" ? "reverse_chronological" : "chronological";
    const viewerAddress = searchParams.get("viewerAddress")?.trim();

    const creator = await resolveCampaignCreator(id);
    const isCreator = Boolean(viewerAddress) && sameAddress(creator, viewerAddress);

    const requestedStatus = searchParams.get("status");
    const requestedStatuses = requestedStatus
      ? requestedStatus
          .split(",")
          .map((value) => value.trim())
          .filter((value): value is CampaignUpdateStatus =>
            ["draft", "published", "archived"].includes(value),
          )
      : [];
    const statusFilter = requestedStatuses.length ? requestedStatuses : ["published"];

    const dataSource = getCampaignUpdateDataSource();
    const all = await dataSource.getUpdates({
      filter: { campaignId: id },
      limit: Number.MAX_SAFE_INTEGER,
      order,
    });

    // Drafts and archived updates are only visible to the campaign creator.
    const visible = all.filter((update) => {
      if (!statusFilter.includes(update.status)) return false;
      if (update.status !== "published") {
        // The author of an update is always the campaign creator, so matching
        // the author is enough when the campaign itself is not indexed.
        const canSee = isCreator || sameAddress(update.creatorAddress, viewerAddress);
        if (!canSee) return false;
      }
      // `backers_only` updates stay hidden from anonymous visitors.
      if (update.visibility === "backers_only" && !viewerAddress) return false;
      return true;
    });

    const page = visible.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      campaignId: id,
      updates: page,
      pagination: {
        total: visible.length,
        limit,
        offset,
        hasMore: offset + limit < visible.length,
      },
    });
  } catch (error) {
    console.error("Error listing campaign updates:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to list updates" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/campaigns/[id]/updates
 *
 * Create an update. Only the campaign creator may do so. Passing
 * `status: "published"` publishes it immediately and notifies the backers;
 * otherwise the update is saved as a draft.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

    const status: CampaignUpdateStatus =
      body.status === "published" ? "published" : "draft";
    const visibility: CampaignUpdateVisibility =
      body.visibility === "backers_only" ? "backers_only" : "public";
    const notificationMode: CampaignUpdateNotificationMode =
      body.notificationMode === "daily_digest" ||
      body.notificationMode === "weekly_digest" ||
      body.notificationMode === "off" ||
      body.notificationMode === "instant"
        ? body.notificationMode
        : "instant";

    const update = await createCampaignUpdate({
      campaignId: id,
      creatorAddress,
      title: body.title,
      bodyMarkdown: body.bodyMarkdown ?? body.body ?? "",
      excerpt: body.excerpt,
      imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls : [],
      tags: Array.isArray(body.tags) ? body.tags : [],
      status: "draft",
      visibility,
      notifyBackers: body.notifyBackers !== false,
      notificationMode,
    });

    if (status === "published") {
      const backers = await resolveUpdateRecipients(
        id,
        Array.isArray(body.backers) ? (body.backers as BackerRecipient[]) : [],
      );
      const campaignName = body.campaignTitle ?? "your campaign";
      const published = await publishCampaignUpdateWithNotifications({
        updateId: update.id,
        campaign: { id, name: campaignName },
        backers,
        emailSender: emailService,
        origin: body.origin ?? process.env.NEXT_PUBLIC_APP_ORIGIN,
      });
      return NextResponse.json(
        { success: true, update: published.update, report: published.report },
        { status: 201 },
      );
    }

    return NextResponse.json({ success: true, update }, { status: 201 });
  } catch (error) {
    if (error instanceof CampaignUpdateValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Error creating campaign update:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create update" },
      { status: 500 },
    );
  }
}
