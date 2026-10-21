/**
 * POST /api/campaigns/[id]/email-campaigns/[emailCampaignId]/send
 *
 * Trigger delivery of a draft email campaign. The request body must include
 * the audience's backer list (email addresses + pledge metadata), since the
 * server doesn't yet have a persistent backer-email store.
 *
 * Request body:
 * {
 *   backers: Array<{
 *     backerAddress: string;
 *     email: string;
 *     rewardTier?: string;
 *     totalPledgeAmount: string;  // decimal string
 *   }>
 * }
 */

import { emailCampaignService } from "@/services/email-campaign.service";
import type { BackerEmailRecord } from "@/services/email-campaign.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function json<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    headers: { ...NO_STORE, ...(init?.headers ?? {}) },
  });
}

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; emailCampaignId: string }> },
) {
  const { id: campaignId, emailCampaignId } = await params;

  if (!campaignId?.trim()) {
    return json({ error: "campaignId is required" }, { status: 400 });
  }
  if (!emailCampaignId?.trim()) {
    return json({ error: "emailCampaignId is required" }, { status: 400 });
  }

  const existing = emailCampaignService.getById(emailCampaignId);
  if (!existing) {
    return json({ error: "Email campaign not found" }, { status: 404 });
  }
  if (existing.campaignId !== campaignId.trim()) {
    return json({ error: "Email campaign does not belong to this campaign" }, { status: 403 });
  }

  let body: { backers?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.backers)) {
    return json({ error: "backers array is required" }, { status: 400 });
  }

  // Basic per-item validation
  const backers: BackerEmailRecord[] = [];
  for (const item of body.backers as Record<string, unknown>[]) {
    if (typeof item.backerAddress !== "string" || !item.backerAddress.trim()) continue;
    if (typeof item.email !== "string" || !item.email.trim()) continue;
    backers.push({
      backerAddress: String(item.backerAddress).trim(),
      email: String(item.email).trim(),
      rewardTier: typeof item.rewardTier === "string" ? item.rewardTier.trim() : undefined,
      totalPledgeAmount:
        typeof item.totalPledgeAmount === "string" ? item.totalPledgeAmount : "0",
    });
  }

  try {
    const sendRecord = await emailCampaignService.send(emailCampaignId, backers);
    return json({ sendRecord });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 400 },
    );
  }
}
