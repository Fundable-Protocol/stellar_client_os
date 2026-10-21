import { authorizeAdminRequest } from "@/lib/admin-auth";
import {
  addStaffPick,
  getStaffPicks,
  removeStaffPick,
  StaffPickError,
} from "@/services/campaign-staff-picks.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

function errorResponse(error: unknown): Response {
  if (error instanceof StaffPickError) {
    return Response.json(
      { error: error.message },
      { status: error.code === "CAMPAIGN_NOT_FOUND" ? 404 : 400, headers: NO_STORE_HEADERS },
    );
  }
  return Response.json(
    { error: "Could not update staff pick curation" },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

/**
 * GET /api/admin/staff-picks — List all staff picks for the admin panel.
 */
export async function GET(request: Request) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  const picks = await getStaffPicks();
  return Response.json({ data: picks, count: picks.length }, { headers: NO_STORE_HEADERS });
}

/**
 * PUT /api/admin/campaigns/:id/staff-pick — Add campaign to staff picks.
 * Body: `{ reason?: string, pickedBy?: string }`.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  let body: { reason?: string; pickedBy?: string } = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const campaignId = (await params).id;
    const campaign = await addStaffPick(campaignId, body);
    return Response.json(
      {
        campaignId: campaign.id,
        isStaffPick: campaign.isStaffPick,
        staffPickReason: campaign.staffPickReason,
        staffPickedAt: campaign.staffPickedAt,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/admin/campaigns/:id/staff-pick — Remove campaign from staff picks.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  try {
    const campaignId = (await params).id;
    const campaign = await removeStaffPick(campaignId);
    return Response.json(
      {
        campaignId: campaign.id,
        isStaffPick: false,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
