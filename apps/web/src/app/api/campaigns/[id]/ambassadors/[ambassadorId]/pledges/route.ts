import { NextRequest, NextResponse } from "next/server";
import {
  AmbassadorValidationError,
  getAmbassador,
  listAmbassadorPledges,
  recordAmbassadorPledge,
} from "@/services/campaign-ambassador.service";
import { authorizeCampaignCreator } from "@/lib/campaign-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns/[id]/ambassadors/[ambassadorId]/pledges
 *
 * Every pledge attributed to an ambassador, oldest first.
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

    const pledges = await listAmbassadorPledges(id, ambassadorId);
    return NextResponse.json({ success: true, ambassadorId, pledges });
  } catch (error) {
    console.error("Error listing ambassador pledges:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to list pledges" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/campaigns/[id]/ambassadors/[ambassadorId]/pledges
 *
 * Record a pledge brought in by an ambassador. When the pledge pushes the
 * ambassador past a tier threshold, the reward is assigned automatically and
 * returned in the response.
 */
export async function POST(
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

    const result = await recordAmbassadorPledge({
      campaignId: id,
      ambassadorId,
      backerAddress: body.backerAddress,
      amount: body.amount,
      token: body.token,
      source: body.source,
    });

    return NextResponse.json(
      {
        success: true,
        pledge: result.pledge,
        ambassador: result.ambassador,
        reward: result.reward ?? null,
        rewardAssigned: Boolean(result.reward),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AmbassadorValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Error recording ambassador pledge:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to record pledge" },
      { status: 500 },
    );
  }
}
