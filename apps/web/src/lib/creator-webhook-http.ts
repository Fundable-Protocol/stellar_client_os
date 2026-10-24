import { CreatorWebhookError } from "@/services/creator-webhook.service";

export const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/** Maps creator webhook errors onto HTTP responses. */
export function creatorWebhookErrorResponse(error: unknown): Response {
  if (error instanceof CreatorWebhookError) {
    const status =
      error.code === "NOT_AUTHORIZED" ? 403 : error.code === "NOT_CONFIGURED" ? 404 : 400;
    return Response.json({ error: error.message, code: error.code }, { status, headers: NO_STORE });
  }
  return Response.json({ error: "Webhook operation failed" }, { status: 500, headers: NO_STORE });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new CreatorWebhookError("INVALID_INPUT", "Invalid JSON body");
  }
}

/**
 * Webhook settings expose the creator's endpoint and delivery history, so the
 * caller must be the creator whose address is in the path. The caller is read
 * from the `x-caller-address` header, a `callerAddress` query param, or the body.
 */
export function assertCreatorCaller(
  request: Request,
  address: string,
  body?: Record<string, unknown>,
): void {
  const caller =
    request.headers.get("x-caller-address") ??
    new URL(request.url).searchParams.get("callerAddress") ??
    (typeof body?.callerAddress === "string" ? body.callerAddress : null);
  if (!caller || caller.trim().toLowerCase() !== address.trim().toLowerCase()) {
    throw new CreatorWebhookError("NOT_AUTHORIZED", "Only the creator can manage these webhooks");
  }
}
