import { NextRequest, NextResponse } from "next/server";
import { queryCampaigns } from "@/services/campaign.service";
import {
  getCampaignPlantingSites,
  summarizePlantingSites,
  type CampaignPlantingSite,
} from "@/services/campaign-geolocation.service";

export const runtime = "nodejs";

/**
 * GET /api/campaigns/planting-sites
 *
 * Returns every campaign planting site that has GPS coordinates, with the tree
 * counts and species needed to render the global planting map (v1).
 *
 * Query params:
 *  - status  : filter by lifecycle status. Defaults to `ACTIVE` (the global
 *              plantings map shows active locations only). Pass `all` to return
 *              sites for every status.
 *  - network : "testnet" | "mainnet"
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const statusFilter = searchParams.get("status") ?? "ACTIVE";
    const network = searchParams.get("network") as "testnet" | "mainnet" | null;
    const limit = Number(searchParams.get("limit") ?? 1000);
    const offset = Number(searchParams.get("offset") ?? 0);

    const campaigns = await queryCampaigns({
      filter: statusFilter === "all" ? undefined : ({ status: statusFilter } as { status: string }),
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 5000) : 1000,
      offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
      network: network ?? undefined,
    });

    const sites: CampaignPlantingSite[] = getCampaignPlantingSites(campaigns);
    const stats = summarizePlantingSites(sites);

    return NextResponse.json({
      data: sites,
      stats,
      meta: {
        statusFilter,
        count: sites.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load planting sites";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}