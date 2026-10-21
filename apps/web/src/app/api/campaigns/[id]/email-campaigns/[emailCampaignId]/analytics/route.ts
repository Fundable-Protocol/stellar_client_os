/**
 * GET  /api/campaigns/[id]/email-campaigns/[emailCampaignId]/analytics
 *   Return open-rate / click-rate analytics for the given sent email campaign.
 *
 * POST /api/campaigns/[id]/email-campaigns/[emailCampaignId]/analytics
 *   Record a tracking event (open or click) from the tracking pixel / link
 *   redirect endpoint.
 *
 *   Body: { recipientHash: string; type: "open"|"click"; url?: string }
 */

import { emailCampaignService, hashEmail } from "@/services/email-campaign.service";
import type { TrackingEventType } from "@/types/email-campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function json<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    headers: { ...NO_STORE, ...(init?.headers ?? {}) },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; emailCampaignId: string }> },
) {
  const { id: campaignId, emailCampaignId } = await params;

  const campaign = emailCampaignService.getById(emailCampaignId);
  if (!campaign) return json({ error: "Email campaign not found" }, { status: 404 });
  if (campaign.campaignId !== campaignId.trim()) {
    return json({ error: "Email campaign does not belong to this campaign" }, { status: 403 });
  }

  const analytics = emailCampaignService.getAnalytics(emailCampaignId);
  return json({ analytics });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; emailCampaignId: string }> },
) {
  const { emailCampaignId } = await params;

  let body: { recipientHash?: string; email?: string; type?: string; url?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validTypes: TrackingEventType[] = ["open", "click"];
  if (!body.type || !validTypes.includes(body.type as TrackingEventType)) {
    return json({ error: "type must be 'open' or 'click'" }, { status: 400 });
  }

  // Accept either a pre-hashed recipientHash or a raw email that we hash here
  const recipientHash =
    body.recipientHash?.trim() ||
    (body.email ? hashEmail(body.email) : undefined);

  if (!recipientHash) {
    return json({ error: "recipientHash or email is required" }, { status: 400 });
  }

  const event = emailCampaignService.recordEvent({
    emailCampaignId,
    recipientHash,
    type: body.type as TrackingEventType,
    url: body.url?.trim() || undefined,
  });

  return json({ event }, { status: 201 });
}
