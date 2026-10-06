import { NextResponse } from "next/server";
import { z } from "zod";
import { getCampaign } from "@/services/campaign.service";
import {
  PARTNERSHIP_ERROR_STATUS,
  PartnershipError,
  getPartnershipDataSource,
  getPartnershipRequest,
  updatePartnershipStatus,
} from "@/services/campaign-partnership.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

const UpdateStatusSchema = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "REJECTED", "COMPLETED", "CANCELED"]),
  updatedBy: z.string().trim().min(1).max(120).optional(),
});

function errorResponse(error: unknown): Response {
  if (error instanceof PartnershipError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: PARTNERSHIP_ERROR_STATUS[error.code], headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json(
    { error: "Partnership request failed" },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

/**
 * GET /api/campaigns/:id/partnerships/:requestId — a single partnership request
 * for the campaign. Non-matching ids return 404 so campaign data never leaks.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const { id: campaignId, requestId } = await params;
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found", code: "CAMPAIGN_NOT_FOUND" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const request = await getPartnershipRequest(requestId);
    if (!request || request.campaignId !== campaignId) {
      return NextResponse.json(
        { error: "Partnership request not found", code: "PARTNERSHIP_NOT_FOUND" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json({ data: request }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/campaigns/:id/partnerships/:requestId — advance the partnership
 * lifecycle: PENDING → ACCEPTED|REJECTED|CANCELED and ACCEPTED → COMPLETED|CANCELED.
 * Terminal statuses can never be moved again.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const { id: campaignId, requestId } = await params;
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found", code: "CAMPAIGN_NOT_FOUND" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const parsed = UpdateStatusSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid status update", issues: parsed.error.flatten().fieldErrors },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const existing = await getPartnershipRequest(requestId);
    if (!existing || existing.campaignId !== campaignId) {
      return NextResponse.json(
        { error: "Partnership request not found", code: "PARTNERSHIP_NOT_FOUND" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const updated = await updatePartnershipStatus(
      requestId,
      parsed.data.status,
      getPartnershipDataSource(),
      parsed.data.updatedBy,
    );
    return NextResponse.json({ data: updated }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}