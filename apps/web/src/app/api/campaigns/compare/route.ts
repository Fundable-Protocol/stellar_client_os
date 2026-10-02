import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CampaignComparisonError,
  MAX_COMPARED_CAMPAIGNS,
  getCampaignComparisonService,
  parseComparisonIds,
} from "@/services/campaign-comparison.service";

/**
 * GET /api/campaigns/compare — Campaign comparison, side-by-side details (issue #929).
 *
 * Without `ids`, returns the campaigns a sponsor can pick from. With `ids`,
 * returns up to three campaigns side by side: tree species, location,
 * completion rate, CO2 impact, sponsor count, and cost per tree, plus which
 * campaign leads each metric.
 *
 * # Query parameters
 *   - ids     — comma-separated campaign ids, at most 3 (e.g. `ids=1,2,4`).
 *   - network — Soroban network (testnet | mainnet), default `testnet`.
 *
 * # Response
 * ```json
 * { "data": { "options": [ { "campaignId": "1", "title": "...", "status": "Active", "location": "Lamu, Kenya" } ] } }
 * { "data": { "campaigns": [ ... ], "leaders": { "completionRate": ["1"], "co2": ["2"],
 *             "sponsorCount": ["4"], "costPerTree": ["2"] }, "missing": [] },
 *   "meta": { "maxCampaigns": 3, "network": "testnet" } }
 * ```
 *
 * Ids that match no campaign are reported in `missing`; when none match, the
 * request is a 404.
 */
const NetworkSchema = z.enum(["testnet", "mainnet"]).optional();

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const network = NetworkSchema.safeParse(searchParams.get("network") ?? undefined);
  if (!network.success) {
    return NextResponse.json({ error: "network must be testnet or mainnet" }, { status: 400 });
  }
  const meta = { maxCampaigns: MAX_COMPARED_CAMPAIGNS, network: network.data ?? "testnet" };

  let ids: string[];
  try {
    ids = parseComparisonIds(searchParams.get("ids"));
  } catch (error) {
    if (error instanceof CampaignComparisonError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    const service = getCampaignComparisonService();
    if (ids.length === 0) {
      return NextResponse.json({ data: { options: await service.listOptions(meta.network) }, meta });
    }

    const comparison = await service.compare(ids, meta.network);
    if (comparison.campaigns.length === 0) {
      return NextResponse.json(
        { error: "None of the requested campaigns were found", missing: comparison.missing },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: comparison, meta });
  } catch (error: unknown) {
    console.error("Failed to compare campaigns", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to compare campaigns" }, { status: 500 });
  }
}
