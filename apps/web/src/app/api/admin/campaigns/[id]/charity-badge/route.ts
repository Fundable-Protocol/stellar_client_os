import { authorizeAdminRequest } from "@/lib/admin-auth";
import { CharityBadgeError, awardCharityBadge, revokeCharityBadge } from "@/services/campaign-charity-badge.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

function errorResponse(error: unknown): Response {
  if (error instanceof CharityBadgeError) {
    return Response.json(
      { error: error.message },
      { status: error.code === "CAMPAIGN_NOT_FOUND" ? 404 : 400, headers: NO_STORE_HEADERS },
    );
  }
  return Response.json({ error: "Could not update charity badge" }, { status: 500, headers: NO_STORE_HEADERS });
}

/**
 * PUT /api/admin/campaigns/:id/charity-badge — award a Tax-Exempt or Charity
 * Verified badge. Body: `{ type: "TAX_EXEMPT" | "CHARITY_VERIFIED",
 * documentationUrl: string, awardedBy: string }`. Requires the admin bearer token.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  let body: { type?: unknown; documentationUrl?: unknown; awardedBy?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const campaign = await awardCharityBadge((await params).id, {
      type: body.type,
      documentationUrl: body.documentationUrl,
      awardedBy: typeof body.awardedBy === "string" ? body.awardedBy : "",
    });
    return Response.json({ charityBadge: campaign.charityBadge }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/admin/campaigns/:id/charity-badge — revoke the badge. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  try {
    await revokeCharityBadge((await params).id);
    return Response.json({ charityBadge: null }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
