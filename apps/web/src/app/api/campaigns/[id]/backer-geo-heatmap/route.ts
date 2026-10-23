import { NextRequest, NextResponse } from "next/server";
import { backerGeoHeatMapService } from "@/services/backer-geo-heatmap.service";
import type { BackerGeoEvent, BackerGeoQueryFilters } from "@/types/backer-geo-heatmap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns/[id]/backer-geo-heatmap
 *
 * Returns aggregated backer geographic distribution for a campaign.
 *
 * Privacy-preserving: only country-level aggregates are returned.
 *
 * # Query parameters
 *   - tierLabel  (optional) — filter by pledge tier label
 *   - fromDate   (optional) — ISO-8601 start of date range
 *   - toDate     (optional) — ISO-8601 end of date range
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const { id: campaignId } = params;
  const url = new URL(req.url);

  const filters: BackerGeoQueryFilters = {
    tierLabel: url.searchParams.get("tierLabel") ?? null,
    fromDate: url.searchParams.get("fromDate") ?? null,
    toDate: url.searchParams.get("toDate") ?? null,
  };

  try {
    const result = backerGeoHeatMapService.getHeatMap(campaignId, filters);
    const tiers = backerGeoHeatMapService.getAvailableTiers(campaignId);
    return NextResponse.json({ data: result, availableTiers: tiers });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Failed to retrieve geographic heat map" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/campaigns/[id]/backer-geo-heatmap
 *
 * Records an anonymised pledge event for geographic tracking.
 * Should be called server-side by the pledge handler after resolving
 * the backer's country code from a geolocation service (never exposing
 * raw IP addresses to the client).
 *
 * Request body (JSON):
 * ```json
 * {
 *   "countryCode": "NG",
 *   "countryName": "Nigeria",
 *   "pledgedXlm": "50 XLM",
 *   "tierLabel": "Early Bird",    // optional
 *   "pledgedAt": "2026-10-22T..."
 * }
 * ```
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const { id: campaignId } = params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const event: BackerGeoEvent = {
    campaignId,
    countryCode: String(body.countryCode ?? ""),
    countryName: String(body.countryName ?? ""),
    pledgedXlm: String(body.pledgedXlm ?? ""),
    tierLabel: body.tierLabel ? String(body.tierLabel) : undefined,
    pledgedAt: String(body.pledgedAt ?? new Date().toISOString()),
  };

  try {
    backerGeoHeatMapService.recordPledgeEvent(event);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Failed to record pledge event" },
      { status: 400 },
    );
  }
}