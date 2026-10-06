import { z } from "zod";
import { getCarbonCreditMarketService } from "@/services/carbon-credit-market.service";
import { errorResponse, jsonResponse, parseBody, stellarAccount } from "../../errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ listingId: string }> };

const CancelSchema = z.object({ seller: stellarAccount });

/** GET /api/carbon-credits/listings/:listingId */
export async function GET(_request: Request, { params }: Params) {
  try {
    return jsonResponse(getCarbonCreditMarketService().getListing((await params).listingId));
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/carbon-credits/listings/:listingId — seller cancels; unsold credits leave escrow. */
export async function DELETE(request: Request, { params }: Params) {
  const body = await parseBody(request, CancelSchema);
  if ("response" in body) return body.response;
  try {
    const listing = getCarbonCreditMarketService().cancelListing(
      (await params).listingId,
      body.data.seller,
    );
    return jsonResponse(listing);
  } catch (error) {
    return errorResponse(error);
  }
}
