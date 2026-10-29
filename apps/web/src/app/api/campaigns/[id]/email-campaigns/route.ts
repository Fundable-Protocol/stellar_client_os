/**
 * POST /api/campaigns/[id]/email-campaigns
 *   Create a new email campaign for the given fundraising campaign.
 *
 * GET  /api/campaigns/[id]/email-campaigns
 *   List all email campaigns for the given fundraising campaign.
 */

import { emailCampaignService } from "@/services/email-campaign.service";
import { campaignMilestoneService } from "@/services/campaign-milestone.service";
import type { CreateEmailCampaignInput } from "@/types/email-campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function json<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    headers: { ...NO_STORE,
      ...(init?.headers ?? {}) },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
)  {
  const { id: campaignId } = await params;
  if (!campaignId?.trim()) {
    return json({ error: "campaignId is required" }, { status: 400 });
  }

  const campaigns = emailCampaignService.listByCampaign(campaignId);
  return json({ campaigns });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
)  {
  const { id: campaignId } = await params;
  if (!campaignId?.trim()) {
    return json({ error: "campaignId is required" }, { status: 400 });
  }

  let body: Partial<CreateEmailCampaignInput>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.subject?.trim()) {
    return json({ error: "subject is required" }, { status: 400 });
  }
  if (!body.creatorAddress?.trim()) {
    return json({ error: "creatorAddress is required" }, { status: 400 });
  }

  try {
    const campaign = emailCampaignService.create({
      campaignId,
      creatorAddress: body.creatorAddress,
      subject: body.subject,
      previewText: body.previewText,
      blocks: body.blocks ?? [],
      audience: body.audience,
      scheduledAt: body.scheduledAt,
    });
    // Trigger milestone achievement email notifications (25%, 50%, 75%, 100%).
    // Failures here must not break campaign creation.
    try {
      campaignMilestoneService.checkAndNotify(campaignId);
    } catch {
      // swallow notification errors
    }
    return json({ campaign }, { status: 201 });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Failed to create email campaign" },
      { status: 400 },
    );
  }
}
