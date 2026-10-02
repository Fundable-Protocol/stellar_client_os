import { NextRequest, NextResponse } from "next/server";
import { getCampaignHallOfFame } from "@/services/campaign-hall-of-fame.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/campaigns/:id/hall-of-fame
 *
 * Issue #904: feat(frontend): Campaign sponsor hall of fame - top contributors
 * Returns top sponsors for a campaign with:
 * - rank
 * - total trees sponsored
 * - total CO2 offset
 * - % of campaign funding from that sponsor
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const hallOfFame = await getCampaignHallOfFame(id, limit);

    if (!hallOfFame) {
      return NextResponse.json(
        { error: `Campaign '${id}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: hallOfFame,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
