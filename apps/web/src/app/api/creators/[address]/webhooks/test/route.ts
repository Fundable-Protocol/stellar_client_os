import {
  assertCreatorCaller,
  creatorWebhookErrorResponse,
  NO_STORE,
  readJsonBody,
} from "@/lib/creator-webhook-http";
import { creatorWebhookService as svc } from "@/services/creator-webhook.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ address: string }> };

/** POST /api/creators/:address/webhooks/test — queue a signed `webhook.test` delivery. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { address } = await params;
    const body = await readJsonBody(request);
    assertCreatorCaller(request, address, body);
    await svc.sendTestEvent(address);
    return Response.json({ queued: true }, { status: 202, headers: NO_STORE });
  } catch (error) {
    return creatorWebhookErrorResponse(error);
  }
}
