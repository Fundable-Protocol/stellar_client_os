import { NextRequest, NextResponse } from "next/server";
import {
  evaluateAllAmbassadorRewards,
  getAmbassadorProgramSummary,
} from "@/services/campaign-ambassador.service";
import { authorizeCampaignCreator } from "@/lib/campaign-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/campaigns/[id]/ambassador-rewards
 *
 * Run the reward assignment across the whole program.
 *
 * Pledges normally trigger the assignment on the spot; this endpoint lets a
 * creator re-run the evaluation (for example after correcting a pledge) and
 * returns the rewards that were assigned.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

    const rewards = await evaluateAllAmbassadorRewards(id);
    const summary = await getAmbassadorProgramSummary(id);

    return NextResponse.json({
      success: true,
      campaignId: id,
      assignedCount: rewards.length,
      rewards,
      summary,
    });
  } catch (error) {
    console.error("Error assigning ambassador rewards:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to assign rewards",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/campaigns/[id]/ambassador-rewards
 *
 * The rewards currently assigned across the program.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const viewerAddress = new URL(request.url).searchParams.get("viewerAddress");
    const authorization = await authorizeCampaignCreator(id, viewerAddress);
    if (!authorization.ok) {
      return NextResponse.json(
        { success: false, error: authorization.error },
        { status: authorization.status },
      );
    }

    const summary = await getAmbassadorProgramSummary(id);
    return NextResponse.json({
      success: true,
      campaignId: id,
      rewards: summary.ambassadors.flatMap((entry) =>
        entry.rewards.map((reward) => ({ ...reward, ambassadorName: entry.ambassador.name })),
      ),
      totalCommissionOwed: summary.totalCommissionOwed,
    });
  } catch (error) {
    console.error("Error listing ambassador rewards:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to list rewards" },
      { status: 500 },
    );
  }
}
