import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCampaignTrendingService } from "@/services/campaign-trending.service";

/**
 * GET /api/campaigns/trending — Rank campaigns by trending score (issue #728).
 *
 * Returns Active campaigns ranked by a tunable composite score built from
 * daily velocity, engagement rate, and completion probability.
 *
 * # Query parameters
 *   - network            — Soroban network (testnet | mainnet), default `testnet`.
 *   - limit              — max results (1–100), default 20.
 *   - offset             — zero-based offset into the sorted list, default 0.
 *   - includeNonActive   — "true" to include non-Active campaigns.
 *
 * # Response
 * ```json
 * {
 *   "data": [ { "id": "1", "score": 87.5, "rank": 1, "components": {...}, "raw": {...} } ],
 *   "meta": { "total": 3, "evaluated": 4, "weights": {...}, "generatedAt": 0, "network": "testnet" }
 * }
 * ```
 */
const QuerySchema = z.object({
  network: z.enum(["testnet", "mainnet"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  includeNonActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const parsed = QuerySchema.safeParse({
      network: searchParams.get("network") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
      includeNonActive: searchParams.get("includeNonActive") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { network, limit, offset, includeNonActive } = parsed.data;
    const service = getCampaignTrendingService();
    const result = await service.getTrendingCampaigns({
      network,
      limit,
      offset,
      includeNonActive,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to compute trending campaigns" },
      { status: 500 }
    );
  }
}
