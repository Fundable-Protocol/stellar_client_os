import { getCarbonCreditMarketService } from "@/services/carbon-credit-market.service";
import { jsonResponse } from "../errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/carbon-credits/trades[?campaignId=&address=] — trade history, newest first. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return jsonResponse(
    getCarbonCreditMarketService().listTrades({
      campaignId: params.get("campaignId") ?? undefined,
      address: params.get("address") ?? undefined,
    }),
  );
}
