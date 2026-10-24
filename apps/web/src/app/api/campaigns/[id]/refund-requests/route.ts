import { randomUUID } from "crypto";
import { getCampaign } from "@/services/campaign.service";
import { creatorWebhookService } from "@/services/creator-webhook.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/campaigns/:id/refund-requests — a backer asks for a refund.
 * Body: `{ backerAddress, amount?, reason?, requestId? }`.
 *
 * Emits the `refund.requested` creator webhook (#1220) so the creator's own
 * systems can review it. `requestId` makes client retries idempotent.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  const backerAddress = typeof body.backerAddress === "string" ? body.backerAddress.trim() : "";
  if (!backerAddress) {
    return Response.json({ error: "backerAddress is required" }, { status: 400, headers: NO_STORE });
  }
  if (body.amount !== undefined && (typeof body.amount !== "string" || !/^\d+$/.test(body.amount))) {
    return Response.json({ error: "amount must be a non-negative integer string" }, { status: 400, headers: NO_STORE });
  }
  if (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 1000)) {
    return Response.json({ error: "reason must be 1,000 characters or fewer" }, { status: 400, headers: NO_STORE });
  }

  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404, headers: NO_STORE });

  const requestId =
    typeof body.requestId === "string" && body.requestId.trim() ? body.requestId.trim() : randomUUID();
  const requestedAt = new Date().toISOString();

  try {
    await creatorWebhookService.notify(campaign.creator, "refund.requested", {
      eventId: `${campaign.id}:refund:${requestId}`,
      campaignId: campaign.id,
      campaignName: campaign.name,
      requestId,
      backerAddress,
      ...(typeof body.amount === "string" && { amount: body.amount }),
      ...(typeof body.reason === "string" && { reason: body.reason }),
      requestedAt,
    });
  } catch (error) {
    console.error(`[Creator webhook] Failed to dispatch refund.requested for ${campaign.id}:`, error);
  }

  return Response.json(
    { requestId, campaignId: campaign.id, status: "REQUESTED", requestedAt },
    { status: 202, headers: NO_STORE },
  );
}
