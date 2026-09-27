import { NextRequest, NextResponse } from "next/server";
import { HALL_OF_FAME_LIMIT, getSponsorHallOfFame } from "@/services/campaign-hall-of-fame.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

function parseLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return HALL_OF_FAME_LIMIT;
  return Math.min(parsed, 50);
}

/**
 * GET /api/campaigns/:id/hall-of-fame
 *
 * Ranked top sponsors with trees sponsored, CO2 offset, and funding share (#972).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const limit = parseLimit(new URL(request.url).searchParams.get("limit"));
  const board = await getSponsorHallOfFame(id, limit);
  return NextResponse.json(board, { headers: NO_STORE });
}
