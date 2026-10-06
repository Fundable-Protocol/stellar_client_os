import { NextResponse } from "next/server";
import { z } from "zod";
import { getCampaign } from "@/services/campaign.service";
import {
  NGO_SERVICE_TYPES,
  PARTNERSHIP_ERROR_STATUS,
  PartnershipError,
  listPartnerships,
  requestPartnership,
  type PartnershipStatus,
} from "@/services/campaign-partnership.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

const CreateRequestSchema = z.object({
  ngoId: z.string().min(1),
  servicesRequested: z.array(z.enum(NGO_SERVICE_TYPES)).min(1),
  proposedTerms: z.string().trim().min(1).max(4000).optional(),
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
 * GET /api/campaigns/:id/partnerships — list the campaign's partnership
 * requests, optionally filtered by ?status=PENDING|ACCEPTED|REJECTED|COMPLETED|CANCELED.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const campaignId = (await params).id;
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found", code: "CAMPAIGN_NOT_FOUND" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const requests = await listPartnerships({ campaignId, status: status as PartnershipStatus | undefined });
    return NextResponse.json({ data: requests }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/campaigns/:id/partnerships — ask a verified NGO to partner for
 * planting services (land access, planting labor, verification). The NGO must
 * exist, be verified, and offer every requested service.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = (await params).id;
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found", code: "CAMPAIGN_NOT_FOUND" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const parsed = CreateRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid partnership request", issues: parsed.error.flatten().fieldErrors },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const partnership = await requestPartnership(
      campaignId,
      parsed.data.ngoId,
      parsed.data.servicesRequested,
      parsed.data.proposedTerms,
      campaign.creator,
    );
    return NextResponse.json({ data: partnership }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}