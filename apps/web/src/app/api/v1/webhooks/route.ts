import {
  authenticatePublicApiRequest,
  consumePublicApiQuota,
  deletePublicWebhookSubscription,
  listPublicWebhookDeliveries,
  listPublicWebhookSubscriptions,
  registerPublicWebhookSubscription,
} from "@/services/public-api.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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

  const subscriptions = listPublicWebhookSubscriptions(
    auth.client.clientId,
    auth.token.environment,
  );
  const deliveries = listPublicWebhookDeliveries(
    auth.client.clientId,
    auth.token.environment,
  );

  return Response.json(
    {
      data: subscriptions,
      deliveries,
      meta: {
        environment: auth.token.environment,
        quota: quotaCheck.quota,
      },
    },
    { status: 200, headers: quotaCheck.headers },
  );
}

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
      url?: string;
      events?: string[];
      secret?: string;
      campaignId?: string;
    };

    const subscription = registerPublicWebhookSubscription({
      clientId: auth.client.clientId,
      environment: auth.token.environment,
      url: body.url ?? "",
      events: body.events ?? [],
      secret: body.secret,
      campaignId: body.campaignId,
    });

    return Response.json(
      {
        data: subscription,
        meta: {
          environment: auth.token.environment,
          quota: quotaCheck.quota,
        },
      },
      { status: 201, headers: quotaCheck.headers },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid webhook subscription payload";
    return Response.json(
      { error: "invalid_request", message },
      { status: 400, headers: quotaCheck.headers },
    );
  }
}

export async function DELETE(request: Request) {
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

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id) {
    return Response.json(
      { error: "invalid_request", message: "Query parameter 'id' is required" },
      { status: 400, headers: quotaCheck.headers },
    );
  }

  const deleted = deletePublicWebhookSubscription(id, auth.client.clientId);
  if (!deleted) {
    return Response.json(
      { error: "not_found", message: `Webhook subscription '${id}' not found.` },
      { status: 404, headers: quotaCheck.headers },
    );
  }

  return Response.json(
    {
      deleted: true,
      id,
      meta: {
        environment: auth.token.environment,
        quota: quotaCheck.quota,
      },
    },
    { status: 200, headers: quotaCheck.headers },
  );
}
