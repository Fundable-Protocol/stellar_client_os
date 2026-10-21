import {
  authenticatePublicApiRequest,
  consumePublicApiQuota,
  getPublicCampaignById,
} from "@/services/public-api.service";
import type { PublicApiEnvironment } from "@/types/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authenticatePublicApiRequest(request, "campaigns:read");
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
        message: "Rate limit quota exceeded for your current API tier.",
        quota: quotaCheck.quota,
      },
      { status: 429, headers: quotaCheck.headers },
    );
  }

  const { id } = await params;
  const url = new URL(request.url);
  const envParam = url.searchParams.get("environment");
  const environment: PublicApiEnvironment =
    envParam === "sandbox" || envParam === "production"
      ? envParam
      : auth.token.environment;

  const found = await getPublicCampaignById(id, environment);
  if (!found) {
    return Response.json(
      { error: "not_found", message: `Campaign '${id}' not found in ${environment} environment.` },
      { status: 404, headers: quotaCheck.headers },
    );
  }

  return Response.json(
    {
      data: found.dto,
      meta: {
        environment,
        quota: quotaCheck.quota,
      },
    },
    { status: 200, headers: quotaCheck.headers },
  );
}
