import { z } from "zod";
import { getCarbonCreditMarketService } from "@/services/carbon-credit-market.service";
import { errorResponse, jsonResponse, parseBody, stellarAccount } from "../../../errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PurchaseSchema = z.object({
  buyer: stellarAccount,
  quantity: z.number().int().positive(),
});

/** POST /api/carbon-credits/listings/:listingId/purchase — buy all or part of a listing. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  const body = await parseBody(request, PurchaseSchema);
  if ("response" in body) return body.response;
  try {
    const trade = getCarbonCreditMarketService().purchase(
      (await params).listingId,
      body.data.buyer,
      body.data.quantity,
    );
    return jsonResponse(trade, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
