import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_IMPACT_LIMIT,
  getCampaignImpactLeaderboardService,
} from "@/services/campaign-impact-leaderboard.service";

/**
 * GET /api/campaigns/impact-leaderboard — Public campaign impact boards (issue #935).
 *
 * Returns the top campaigns for each impact board: most trees planted, most CO2
 * sequestered per year, most sponsors, fastest completion, and most diverse
 * species mix. The species board scores each campaign by tree species
 * diversity — more distinct species means higher environmental value and
 * greater potential carbon credits. Read-only and unauthenticated, like the
 * other public campaign endpoints.
 *
 * # Query parameters
 *   - network — Soroban network (testnet | mainnet), default `testnet`.
 *   - limit   — max entries per board (1–50), default 10.
 *
 * # Response
 * ```json
 * {
 *   "data": {
 *     "trees":    [ { "rank": 1, "campaignId": "1", "value": 8600, "metrics": { ... } } ],
 *     "co2":      [ ... ],
 *     "sponsors": [ ... ],
 *     "fastest":  [ ... ],
 *     "species":  [ ... ]
 *   },
 *   "meta": {
 *     "evaluated": 5,
 *     "limit": 10,
 *     "units": { "trees": "trees", "co2": "kgCO2e/year", "sponsors": "sponsors",
 *                "fastest": "seconds", "species": "species" },
 *     "totals": { "trees": 5, "co2": 5, "sponsors": 4, "fastest": 3, "species": 5 },
 *     "generatedAt": 0,
 *     "network": "testnet"
 *   }
 * }
 * ```
 *
 * `fastest` only ranks campaigns that have completed, so its `totals` can be
 * lower than `evaluated`.
 */
const QuerySchema = z.object({
  network: z.enum(["testnet", "mainnet"]).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_IMPACT_LIMIT).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const parsed = QuerySchema.safeParse({
      network: searchParams.get("network") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const service = getCampaignImpactLeaderboardService();
    const result = await service.getLeaderboard(parsed.data);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to compute the campaign impact leaderboard" },
      { status: 500 },
    );
  }
}
