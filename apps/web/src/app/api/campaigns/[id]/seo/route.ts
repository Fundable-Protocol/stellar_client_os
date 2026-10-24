import { CampaignSeoError, campaignSeoService } from "@/services/campaign-seo.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(error: unknown): Response {
  if (error instanceof CampaignSeoError) {
    const status =
      error.code === "CAMPAIGN_NOT_FOUND" ? 404 : error.code === "NOT_AUTHORIZED" ? 403 : 400;
    return Response.json(
      { error: error.message, code: error.code, details: error.details },
      { status, headers: NO_STORE },
    );
  }
  return Response.json({ error: "Failed to update SEO settings" }, { status: 500, headers: NO_STORE });
}

const optionalString = (value: unknown): string | null | undefined =>
  typeof value === "string" || value === null ? value : undefined;

/** GET /api/campaigns/:id/seo — the creator's SEO overrides (null when unset). */
export async function GET(_request: Request, { params }: Ctx) {
  const seo = campaignSeoService.getSeo((await params).id);
  return Response.json({ seo }, { headers: NO_STORE });
}

/** PUT /api/campaigns/:id/seo — body `{ callerAddress, title?, description?, ogImageUrl? }`. */
export async function PUT(request: Request, { params }: Ctx) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(new CampaignSeoError("INVALID_INPUT", "Invalid JSON body"));
  }

  try {
    const seo = await campaignSeoService.saveSeo({
      campaignId: (await params).id,
      callerAddress: typeof body.callerAddress === "string" ? body.callerAddress : undefined,
      input: {
        title: optionalString(body.title),
        description: optionalString(body.description),
        ogImageUrl: optionalString(body.ogImageUrl),
      },
    });
    return Response.json({ seo }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
