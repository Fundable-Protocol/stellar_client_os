import {
  authenticatePublicApiRequest,
  consumePublicApiQuota,
  listPublicCampaigns,
} from "@/services/public-api.service";
import type { PublicApiEnvironment } from "@/types/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const envParam = url.searchParams.get("environment");
  const environment: PublicApiEnvironment =
    envParam === "sandbox" || envParam === "production"
      ? envParam
      : auth.token.environment;

  const status = url.searchParams.get("status") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const creator = url.searchParams.get("creator") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const result = await listPublicCampaigns({
    environment,
    status,
    search,
    creator,
    limit: Number.isFinite(limit) ? limit : 20,
    offset: Number.isFinite(offset) ? offset : 0,
  });

  return Response.json(
    {
      ...result,
      meta: {
        environment,
        quota: quotaCheck.quota,
      },
    },
    { status: 200, headers: quotaCheck.headers },
  );
}
