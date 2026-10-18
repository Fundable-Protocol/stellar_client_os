import { NextRequest, NextResponse } from "next/server";
import { campaignRefundService } from "@/services/campaign-refund.service";
import { getCampaign } from "@/services/campaign.service";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const walletAddress = request.nextUrl.searchParams.get("walletAddress")?.trim() ?? "";
  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress is required" }, { status: 400, headers: NO_STORE });
  }

  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404, headers: NO_STORE });

  const isCreator = campaign.creator.toLowerCase() === walletAddress.toLowerCase();
  const adminAddress = process.env.REFUND_PLATFORM_ADMIN_ADDRESS?.trim();
  const isAdmin = Boolean(adminAddress && adminAddress.toLowerCase() === walletAddress.toLowerCase());
  if (isCreator || isAdmin) {
    return NextResponse.json(
      { requests: campaignRefundService.getCampaignRequests(id), role: isAdmin ? "admin" : "creator" },
      { headers: NO_STORE },
    );
  }

  return NextResponse.json(
    {
      contributions: campaignRefundService.getBackerContributions(id, walletAddress),
      requests: campaignRefundService.getBackerRequests(id, walletAddress),
      role: "backer",
    },
    { headers: NO_STORE },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      contributionId?: string;
      backerAddress?: string;
      reason?: string;
    };
    const result = await campaignRefundService.requestRefund({
      campaignId: id,
      contributionId: body.contributionId ?? "",
      backerAddress: body.backerAddress ?? "",
      reason: body.reason ?? "",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE });
    }
    return NextResponse.json({ request: result.request }, { status: 201, headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Invalid refund request payload." }, { status: 400, headers: NO_STORE });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      requestId?: string;
      reviewerAddress?: string;
      decision?: "APPROVE" | "DECLINE";
      reason?: string;
    };
    const result = await campaignRefundService.reviewRequest({
      campaignId: id,
      requestId: body.requestId ?? "",
      reviewerAddress: body.reviewerAddress ?? "",
      decision: body.decision ?? "DECLINE",
      reason: body.reason ?? "",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE });
    }
    return NextResponse.json({ request: result.request }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Invalid refund review payload." }, { status: 400, headers: NO_STORE });
  }
}
