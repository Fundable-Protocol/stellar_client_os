import {
  authenticatePublicApiRequest,
  buildPublicApiQuotaHeaders,
  DEFAULT_SANDBOX_CLIENT,
  extractBearerToken,
  getPublicApiQuotaStatus,
  PUBLIC_API_TIER_QUOTAS,
} from "@/services/public-api.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientIdParam = url.searchParams.get("clientId");
  const hasBearer = Boolean(extractBearerToken(request));

  let clientId = clientIdParam || DEFAULT_SANDBOX_CLIENT.clientId;
  if (hasBearer) {
    const auth = authenticatePublicApiRequest(request);
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
    clientId = auth.client.clientId;
  }

  const quota = getPublicApiQuotaStatus(clientId);
  const headers = buildPublicApiQuotaHeaders(quota, !quota.isThrottled);

  return Response.json(
    {
      data: quota,
      tiers: Object.values(PUBLIC_API_TIER_QUOTAS),
    },
    { status: 200, headers },
  );
}
