/**
 * GET  /api/campaigns/:id/boost  — list boosts for a campaign
 * POST /api/campaigns/:id/boost  — purchase a boost
 *
 * Issue #1207 — Campaign boost and paid promotion feature
 */

import { NextRequest, NextResponse } from "next/server";
import {
  BOOST_PRICING_CATALOGUE,
  BoostDurationDays,
  BoostPlacement,
  BoostToken,
  PurchaseBoostInput,
} from "@/types/campaign-boost";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  void id;
  // Real impl: fetch active/recent boosts from DB
  return NextResponse.json({ success: true, boosts: [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as Partial<PurchaseBoostInput>;

  const VALID_DURATIONS: BoostDurationDays[] = [3, 7, 14, 30];
  const VALID_PLACEMENTS: BoostPlacement[] = ["HOMEPAGE", "SEARCH", "CATEGORY"];
  const VALID_TOKENS: BoostToken[] = ["XLM", "USDC"];

  if (!body.creatorAddress) {
    return NextResponse.json({ success: false, error: "creatorAddress is required" }, { status: 400 });
  }
  if (!body.durationDays || !VALID_DURATIONS.includes(body.durationDays)) {
    return NextResponse.json({ success: false, error: "invalid durationDays" }, { status: 400 });
  }
  if (!Array.isArray(body.placements) || body.placements.some((p) => !VALID_PLACEMENTS.includes(p))) {
    return NextResponse.json({ success: false, error: "invalid placements" }, { status: 400 });
  }
  if (!body.token || !VALID_TOKENS.includes(body.token)) {
    return NextResponse.json({ success: false, error: "invalid token" }, { status: 400 });
  }

  const pricingTier = BOOST_PRICING_CATALOGUE.find((t) => t.durationDays === body.durationDays);
  const totalPaid = pricingTier?.totalPrice ?? "0.00";

  const now = Date.now();
  const boost = {
    id: `boost-${Date.now()}`,
    campaignId: id,
    creatorAddress: body.creatorAddress,
    placements: body.placements,
    durationDays: body.durationDays,
    startDate: now,
    endDate: now + body.durationDays * 24 * 60 * 60 * 1000,
    totalPaid,
    token: body.token,
    status: "ACTIVE",
    createdAt: now,
  };

  return NextResponse.json({ success: true, boost }, { status: 201 });
}
