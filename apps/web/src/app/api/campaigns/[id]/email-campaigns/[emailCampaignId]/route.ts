/**
 * GET    /api/campaigns/[id]/email-campaigns/[emailCampaignId]
 *   Retrieve a single email campaign by id.
 *
 * PATCH  /api/campaigns/[id]/email-campaigns/[emailCampaignId]
 *   Update a draft email campaign (subject, blocks, audience, etc.).
 *
 * DELETE /api/campaigns/[id]/email-campaigns/[emailCampaignId]
 *   Delete a draft email campaign.
 */

import { emailCampaignService } from "@/services/email-campaign.service";
import type { UpdateEmailCampaignInput } from "@/types/email-campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function json<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    headers: { ...NO_STORE, ...(init?.headers ?? {}) },
  });
}

function resolveParams(params: Promise<{ id: string; emailCampaignId: string }>) {
  return params;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; emailCampaignId: string }> },
) {
  const { id: campaignId, emailCampaignId } = await resolveParams(params);
  const campaign = emailCampaignService.getById(emailCampaignId);
  if (!campaign) return json({ error: "Email campaign not found" }, { status: 404 });
  if (campaign.campaignId !== campaignId.trim()) {
    return json({ error: "Email campaign does not belong to this campaign" }, { status: 403 });
  }
  return json({ campaign });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailCampaignId: string }> },
) {
  const { id: campaignId, emailCampaignId } = await resolveParams(params);
  const campaign = emailCampaignService.getById(emailCampaignId);
  if (!campaign) return json({ error: "Email campaign not found" }, { status: 404 });
  if (campaign.campaignId !== campaignId.trim()) {
    return json({ error: "Email campaign does not belong to this campaign" }, { status: 403 });
  }

  let body: Partial<UpdateEmailCampaignInput>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const updated = emailCampaignService.update(emailCampaignId, body);
    return json({ campaign: updated });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; emailCampaignId: string }> },
) {
  const { id: campaignId, emailCampaignId } = await resolveParams(params);
  const campaign = emailCampaignService.getById(emailCampaignId);
  if (!campaign) return json({ error: "Email campaign not found" }, { status: 404 });
  if (campaign.campaignId !== campaignId.trim()) {
    return json({ error: "Email campaign does not belong to this campaign" }, { status: 403 });
  }

  try {
    emailCampaignService.delete(emailCampaignId);
    return json({ success: true });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 400 },
    );
  }
}
