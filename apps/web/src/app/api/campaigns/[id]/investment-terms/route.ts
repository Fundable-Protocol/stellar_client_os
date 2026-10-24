import {
  InvestmentTermsError,
  campaignInvestmentTermsService as svc,
} from "@/services/campaign-investment-terms.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(error: unknown): Response {
  if (error instanceof InvestmentTermsError) {
    const status =
      error.code === "CAMPAIGN_NOT_FOUND" ? 404 : error.code === "NOT_AUTHORIZED" ? 403 : 400;
    return Response.json(
      { error: error.message, code: error.code, details: error.details },
      { status, headers: NO_STORE },
    );
  }
  return Response.json({ error: "Investment terms operation failed" }, { status: 500, headers: NO_STORE });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new InvestmentTermsError("INVALID_INPUT", "Invalid JSON body");
  }
}

/** GET /api/campaigns/:id/investment-terms — public; `terms` is null for non-investment campaigns. */
export async function GET(_request: Request, { params }: Ctx) {
  return Response.json({ terms: svc.getTerms((await params).id) }, { headers: NO_STORE });
}

/** PUT /api/campaigns/:id/investment-terms — creator only; body is `{ callerAddress, ...terms }`. */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { callerAddress, ...input } = await readBody(request);
    const terms = await svc.saveTerms({
      campaignId: (await params).id,
      callerAddress: typeof callerAddress === "string" ? callerAddress : undefined,
      input,
    });
    return Response.json({ terms }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/campaigns/:id/investment-terms — creator only; body `{ callerAddress }`. */
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { callerAddress } = await readBody(request);
    const removed = await svc.clearTerms({
      campaignId: (await params).id,
      callerAddress: typeof callerAddress === "string" ? callerAddress : undefined,
    });
    return Response.json({ removed }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
