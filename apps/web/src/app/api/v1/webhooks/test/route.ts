import {
  authenticatePublicApiRequest,
  consumePublicApiQuota,
  triggerSandboxWebhookEvent,
} from "@/services/public-api.service";
import type { PublicWebhookEventType } from "@/types/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = authenticatePublicApiRequest(request, "webhooks:manage");
  if (!auth.ok) {
    return Response.json(
      { error: auth.error, error_description: auth.errorDescription },
      {
        status: auth.status,
        headers: {
          "WWW-Authenticate": `Bearer realm="Fundable Public API", error="${auth.error}"`,
        },
      },
    );
  }

  const quotaCheck = consumePublicApiQuota(auth.client.clientId);
  if (!quotaCheck.allowed) {
    return Response.json(
      {
        error: "rate_limit_exceeded",
        code: "RATE_LIMIT_EXCEEDED",
        message: "Rate limit quota exceeded.",
        quota: quotaCheck.quota,
      },
      { status: 429, headers: quotaCheck.headers },
    );
  }

  try {
    const body = (await request.json()) as {
      event?: PublicWebhookEventType;
      campaignId?: string;
      subscriptionId?: string;
      customPayload?: Record<string, unknown>;
    };

    const result = triggerSandboxWebhookEvent({
      clientId: auth.client.clientId,
      environment: auth.token.environment,
      event: body.event ?? "campaign.milestone_reached",
      campaignId: body.campaignId,
      subscriptionId: body.subscriptionId,
      customPayload: body.customPayload,
    });

    return Response.json(
      {
        delivery: result.delivery,
        dispatchedHeaders: result.headers,
        meta: {
          environment: auth.token.environment,
          quota: quotaCheck.quota,
        },
      },
      { status: 200, headers: quotaCheck.headers },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to dispatch test webhook";
    return Response.json(
      { error: "invalid_request", message },
      { status: 400, headers: quotaCheck.headers },
    );
  }
}
