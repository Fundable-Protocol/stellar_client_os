import { z } from "zod";
import { hasAdminToken, isStellarAccount } from "@/lib/admin-auth";
import { getCarbonCreditMarketService } from "@/services/carbon-credit-market.service";
import {
  ISSUER_TOKEN_ENV,
  NO_STORE_HEADERS,
  badRequest,
  errorResponse,
  jsonResponse,
  parseBody,
  stellarAccount,
} from "../errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IssueSchema = z.object({
  campaignId: z.string().min(1),
  holder: stellarAccount,
  quantity: z.number().int().positive(),
  vintage: z.number().int(),
});

/** GET /api/carbon-credits/balances?address=G... — a holder's credits per campaign. */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!isStellarAccount(address)) return badRequest("address must be a Stellar account address");
  return jsonResponse(getCarbonCreditMarketService().getBalances(address));
}

/**
 * POST /api/carbon-credits/balances
 *
 * Issues credits a sponsor earned from a verified campaign. Restricted to the
 * impact oracle via `Authorization: Bearer $CARBON_MARKET_ADMIN_TOKEN`.
 */
export async function POST(request: Request) {
  if (!hasAdminToken(request, ISSUER_TOKEN_ENV)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const body = await parseBody(request, IssueSchema);
  if ("response" in body) return body.response;
  try {
    return jsonResponse(getCarbonCreditMarketService().issueCredits(body.data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
