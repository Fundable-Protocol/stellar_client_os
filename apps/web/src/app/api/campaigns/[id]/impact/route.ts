import { NextRequest, NextResponse } from "next/server";
import {
  getCampaignImpactAt,
  recordCampaignImpactSnapshot,
} from "@/services/campaign-impact-history.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

function noStore<T>(body: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE, ...(init?.headers ?? {}) },
  });
}

/**
 * GET /api/campaigns/:id/impact?date=2026-09-01
 *
 * Historical campaign impact: tree count, CO2 sequestration, sponsor count (#970).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? url.searchParams.get("at") ?? undefined;

  try {
    const snapshot = await getCampaignImpactAt(id, date ?? undefined);
    return snapshot
      ? noStore({ data: snapshot })
      : noStore({ error: "Campaign not found" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid impact query";
    return noStore({ error: message }, { status: 400 });
  }
}

/**
 * POST /api/campaigns/:id/impact
 *
 * Record a point-in-time impact snapshot used by later historical queries.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      treeCount?: number;
      sponsorCount?: number;
      co2SequestrationKg?: number;
      at?: number;
    };
    if (body.treeCount === undefined || body.sponsorCount === undefined) {
      return noStore({ error: "treeCount and sponsorCount are required" }, { status: 400 });
    }
    const snapshot = await recordCampaignImpactSnapshot(id, {
      treeCount: body.treeCount,
      sponsorCount: body.sponsorCount,
      co2SequestrationKg: body.co2SequestrationKg,
      at: body.at,
    });
    return snapshot
      ? noStore({ data: snapshot }, { status: 201 })
      : noStore({ error: "Campaign not found" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid impact snapshot";
    return noStore({ error: message }, { status: 400 });
  }
}
