import {
  assertCreatorCaller,
  creatorWebhookErrorResponse,
  NO_STORE,
  readJsonBody,
} from "@/lib/creator-webhook-http";
import { CREATOR_WEBHOOK_EVENTS, creatorWebhookService as svc } from "@/services/creator-webhook.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ address: string }> };

/** GET /api/creators/:address/webhooks — the creator's endpoint (secret masked). */
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { address } = await params;
    assertCreatorCaller(request, address);
    return Response.json(
      {
        config: await svc.getConfig(address),
        availableEvents: CREATOR_WEBHOOK_EVENTS,
        maxAttempts: svc.maxAttempts,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return creatorWebhookErrorResponse(error);
  }
}

/**
 * PUT /api/creators/:address/webhooks — create or update the endpoint.
 * Body: `{ callerAddress, url, events, secret?, enabled?, rotateSecret? }`.
 * The plaintext secret is returned only when it was generated or replaced.
 */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { address } = await params;
    const body = await readJsonBody(request);
    assertCreatorCaller(request, address, body);
    const result = await svc.saveConfig(address, body);
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    return creatorWebhookErrorResponse(error);
  }
}

/** DELETE /api/creators/:address/webhooks — remove the endpoint. */
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { address } = await params;
    const body = await readJsonBody(request);
    assertCreatorCaller(request, address, body);
    return Response.json({ removed: await svc.deleteConfig(address) }, { headers: NO_STORE });
  } catch (error) {
    return creatorWebhookErrorResponse(error);
  }
}
