import { resolveWidgetTheme } from "@/lib/widget-theme";
import {
  authenticatePublicApiRequest,
  buildPublicWidgetEmbedDto,
  consumePublicApiQuota,
  DEFAULT_SANDBOX_CLIENT,
  extractBearerToken,
  getPublicCampaignById,
  renderPublicWidgetHtml,
} from "@/services/public-api.service";
import type { PublicApiEnvironment } from "@/types/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";
  const themeParam = url.searchParams.get("theme") ?? undefined;
  const theme = resolveWidgetTheme(themeParam);

  // If format=html and no bearer token is passed (direct iframe embed), allow public rendering
  // while still enforcing rate-limiting against the sandbox/public widget quota.
  const hasBearer = Boolean(extractBearerToken(request));
  let clientId = DEFAULT_SANDBOX_CLIENT.clientId;
  let environment: PublicApiEnvironment =
    url.searchParams.get("environment") === "production" ? "production" : "sandbox";

  if (hasBearer || format !== "html") {
    const auth = authenticatePublicApiRequest(request, "widgets:embed");
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
    const envParam = url.searchParams.get("environment");
    environment =
      envParam === "sandbox" || envParam === "production"
        ? envParam
        : auth.token.environment;
  }

  const quotaCheck = consumePublicApiQuota(clientId);
  if (!quotaCheck.allowed) {
    return Response.json(
      {
        error: "rate_limit_exceeded",
        code: "RATE_LIMIT_EXCEEDED",
        message: "Rate limit quota exceeded for widget endpoint.",
        quota: quotaCheck.quota,
      },
      { status: 429, headers: quotaCheck.headers },
    );
  }

  const found = await getPublicCampaignById(id, environment);
  if (!found) {
    return Response.json(
      { error: "not_found", message: `Campaign '${id}' not found in ${environment} environment.` },
      { status: 404, headers: quotaCheck.headers },
    );
  }

  if (format === "html") {
    const html = renderPublicWidgetHtml(found.record, theme, environment);
    return new Response(html, {
      status: 200,
      headers: {
        ...quotaCheck.headers,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=120",
      },
    });
  }

  const widgetDto = buildPublicWidgetEmbedDto(found.record, {
    baseUrl: url.origin,
    theme,
    environment,
  });

  return Response.json(
    {
      data: widgetDto,
      meta: {
        environment,
        quota: quotaCheck.quota,
      },
    },
    { status: 200, headers: quotaCheck.headers },
  );
}
