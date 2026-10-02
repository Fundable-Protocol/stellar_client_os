import { NextRequest, NextResponse } from "next/server";
import { getCampaignImpactHistory } from "@/services/campaign-impact-history.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/campaigns/:id/impact
 * Query campaign ecological impact over time.
 * Supports querying tree count, CO2 sequestration, and sponsor count for any date in campaign history.
 *
 * Query Parameters:
 * - date: (optional) ISO date (YYYY-MM-DD), timestamp, or date string to get impact on that specific date.
 * - startDate: (optional) Filter timeline from this start date.
 * - endDate: (optional) Filter timeline to this end date.
 * - interval: (optional) "day" | "week" | "month" | "year"
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const date = searchParams.get("date") || undefined;
    const startDate = searchParams.get("startDate") || searchParams.get("from") || undefined;
    const endDate = searchParams.get("endDate") || searchParams.get("to") || undefined;
    const interval = (searchParams.get("interval") as "day" | "week" | "month" | "year") || undefined;

    const impactHistory = await getCampaignImpactHistory(id, {
      date,
      startDate,
      endDate,
      interval,
    });

    if (!impactHistory) {
      return NextResponse.json(
        { error: `Campaign with id '${id}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: impactHistory,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
