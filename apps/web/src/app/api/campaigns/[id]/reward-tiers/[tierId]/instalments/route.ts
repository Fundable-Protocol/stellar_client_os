import { NextRequest, NextResponse } from "next/server";
import { campaignInstalmentsService } from "@/services/campaign-instalments.service";
import { InstalmentPlanMonths, isSupportedPlanMonths } from "@/types/campaign-instalments";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * GET  /api/campaigns/:id/reward-tiers/:tierId/instalments
 * Get breakdown for chosen plan months (2, 3, or 6)
 *
 * POST /api/campaigns/:id/reward-tiers/:tierId/instalments
 * Checkout with instalment plan
 * Acceptance Criteria 2 & 3:
 * - Backers choose 2, 3, or 6 month plans at checkout
 * - First instalment charged at campaign close; subsequent on monthly schedule
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tierId: string }> },
) {
  const { id, tierId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const monthsParam = Number(searchParams.get("months") ?? "3");

  if (!isSupportedPlanMonths(monthsParam)) {
    return NextResponse.json(
      { success: false, error: "Query param 'months' must be 2, 3, or 6." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const breakdown = await campaignInstalmentsService.getInstalmentPlanBreakdown(
      id,
      tierId,
      monthsParam as InstalmentPlanMonths,
    );
    return NextResponse.json({ success: true, breakdown }, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to calculate plan breakdown" },
      { status: 400, headers: NO_STORE },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tierId: string }> },
) {
  const { id, tierId } = await params;
  try {
    const body = (await request.json()) as {
      backerAddress?: string;
      backerEmail?: string;
      planMonths?: number;
      idempotencyKey?: string;
    };

    if (!body.backerAddress?.trim()) {
      return NextResponse.json(
        { success: false, error: "backerAddress is required" },
        { status: 400, headers: NO_STORE },
      );
    }

    if (!isSupportedPlanMonths(body.planMonths)) {
      return NextResponse.json(
        { success: false, error: "planMonths must be 2, 3, or 6" },
        { status: 400, headers: NO_STORE },
      );
    }

    const pledge = await campaignInstalmentsService.checkoutWithInstalments({
      campaignId: id,
      tierId,
      backerAddress: body.backerAddress,
      backerEmail: body.backerEmail,
      planMonths: body.planMonths as InstalmentPlanMonths,
      idempotencyKey: body.idempotencyKey,
    });

    return NextResponse.json({ success: true, pledge }, { status: 201, headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to process instalment checkout" },
      { status: 400, headers: NO_STORE },
    );
  }
}
