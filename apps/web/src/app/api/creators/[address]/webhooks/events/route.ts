import { assertCreatorCaller, creatorWebhookErrorResponse, NO_STORE } from "@/lib/creator-webhook-http";
import { creatorWebhookService as svc } from "@/services/creator-webhook.service";
import { getDeliveryStatus } from "@/types/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ address: string }> };

/** GET /api/creators/:address/webhooks/events?limit=50 — delivery log, newest first. */
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { address } = await params;
    assertCreatorCaller(request, address);
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
    const attempts = await svc.getEventLog(address, Number.isFinite(limit) ? limit : 50);
    // Payloads can contain backer details; the dashboard log only needs metadata.
    const events = attempts.map((attempt) => ({
      id: attempt.id,
      event: attempt.event,
      timestamp: attempt.timestamp,
      statusCode: attempt.statusCode,
      errorMessage: attempt.errorMessage,
      attempt: attempt.attempt,
      maxAttempts: attempt.maxAttempts,
      nextRetryAt: attempt.nextRetryAt ?? null,
      status: getDeliveryStatus(attempt),
    }));
    return Response.json({ events }, { headers: NO_STORE });
  } catch (error) {
    return creatorWebhookErrorResponse(error);
  }
}
