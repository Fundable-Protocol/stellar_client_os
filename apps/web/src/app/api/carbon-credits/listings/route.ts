import { z } from "zod";
import { isAmountString } from "@/lib/decimal-amount";
import {
  getCarbonCreditMarketService,
  type ListingStatus,
} from "@/services/carbon-credit-market.service";
import { badRequest, errorResponse, jsonResponse, parseBody, stellarAccount } from "../errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LISTING_STATUSES: ListingStatus[] = ["open", "filled", "cancelled"];

const CreateListingSchema = z.object({
  seller: stellarAccount,
  campaignId: z.string().min(1),
  quantity: z.number().int().positive(),
  pricePerCredit: z.string().refine(isAmountString, "must be a decimal amount"),
  asset: z.string().min(1).max(64).default("USDC"),
});

/**
 * GET /api/carbon-credits/listings[?campaignId=&seller=&status=open|filled|cancelled|all]
 *
 * The order book, cheapest first. Defaults to open listings.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const status = params.get("status") ?? "open";
  if (status !== "all" && !LISTING_STATUSES.includes(status as ListingStatus)) {
    return badRequest(`status must be one of ${[...LISTING_STATUSES, "all"].join(", ")}`);
  }
  return jsonResponse(
    getCarbonCreditMarketService().listListings({
      campaignId: params.get("campaignId") ?? undefined,
      seller: params.get("seller") ?? undefined,
      status: status === "all" ? undefined : (status as ListingStatus),
    }),
  );
}

/** POST /api/carbon-credits/listings — list earned credits for sale. */
export async function POST(request: Request) {
  const body = await parseBody(request, CreateListingSchema);
  if ("response" in body) return body.response;
  try {
    return jsonResponse(getCarbonCreditMarketService().createListing(body.data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
