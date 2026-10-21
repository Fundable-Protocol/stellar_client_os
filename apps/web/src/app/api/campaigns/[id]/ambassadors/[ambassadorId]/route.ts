import { NextRequest, NextResponse } from "next/server";
import {
  AmbassadorValidationError,
  getAmbassador,
  getAmbassadorPledgeSummary,
  getAmbassadorRewardDataSource,
  listAmbassadorPledges,
  removeAmbassador,
  setAmbassadorStatus,
  setAmbassadorTier,
} from "@/services/campaign-ambassador.service";
import { authorizeCampaignCreator } from "@/lib/campaign-authorization";
import { isAmbassadorTier, type AmbassadorStatus } from "@/types/ambassador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: AmbassadorStatus[] = [
  "invited",
  "active",
  "paused",
  "completed",
  "declined",
];

/**
 * GET /api/campaigns/[id]/ambassadors/[ambassadorId]
 *
 * A single ambassador with their pledge progress and assigned rewards.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ambassadorId: string }> },
) {
  const { id, ambassadorId } = await params;
  try {
    const viewerAddress = new URL(request.url).searchParams.get("viewerAddress");
    const authorization = await authorizeCampaignCreator(id, viewerAddress);
    if (!authorization.ok) {
      return NextResponse.json(
        { success: false, error: authorization.error },
        { status: authorization.status },
      );
    }

    const ambassador = await getAmbassador(id, ambassadorId);
    if (!ambassador) {
      return NextResponse.json({ success: false, error: "Ambassador not found" }, { status: 404 });
    }

    const rewards = await getAmbassadorRewardDataSource().getForAmbassador(id, ambassadorId);
    const summary = await getAmbassadorPledgeSummary(ambassador, rewards);
    const pledges = await listAmbassadorPledges(id, ambassadorId);

    return NextResponse.json({
      success: true,
      ambassador,
      summary,
      pledges,
    });
  } catch (error) {
    console.error("Error fetching ambassador:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch ambassador" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/campaigns/[id]/ambassadors/[ambassadorId]
 *
 * Change the tier or the status of an ambassador.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ambassadorId: string }> },
) {
  const { id, ambassadorId } = await params;
  try {
    const body = await request.json();
    const creatorAddress = (body.creatorAddress ?? body.actor ?? "").trim();

    const authorization = await authorizeCampaignCreator(id, creatorAddress);
    if (!authorization.ok) {
      return NextResponse.json(
        { success: false, error: authorization.error },
        { status: authorization.status },
      );
    }

    const ambassador = await getAmbassador(id, ambassadorId);
    if (!ambassador) {
      return NextResponse.json({ success: false, error: "Ambassador not found" }, { status: 404 });
    }

    let updated = ambassador;
    if (body.tier !== undefined) {
      if (!isAmbassadorTier(body.tier)) {
        return NextResponse.json(
          { success: false, error: "Unknown ambassador tier" },
          { status: 400 },
        );
      }
      updated = (await setAmbassadorTier(id, ambassadorId, body.tier)) ?? updated;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { success: false, error: "Unknown ambassador status" },
          { status: 400 },
        );
      }
      updated = (await setAmbassadorStatus(id, ambassadorId, body.status)) ?? updated;
    }

    return NextResponse.json({ success: true, ambassador: updated });
  } catch (error) {
    if (error instanceof AmbassadorValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Error updating ambassador:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update ambassador" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/campaigns/[id]/ambassadors/[ambassadorId]
 *
 * Remove an ambassador from the program.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ambassadorId: string }> },
) {
  const { id, ambassadorId } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const creatorAddress = (body.creatorAddress ?? body.actor ?? "").trim();

    const authorization = await authorizeCampaignCreator(id, creatorAddress);
    if (!authorization.ok) {
      return NextResponse.json(
        { success: false, error: authorization.error },
        { status: authorization.status },
      );
    }

    const removed = await removeAmbassador(id, ambassadorId);
    if (!removed) {
      return NextResponse.json({ success: false, error: "Ambassador not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing ambassador:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to remove ambassador" },
      { status: 500 },
    );
  }
}
