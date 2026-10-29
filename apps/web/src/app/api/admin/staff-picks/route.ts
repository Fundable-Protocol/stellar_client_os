import { authorizeAdminRequest } from "@/lib/admin-auth";
import { getStaffPicks } from "@/services/campaign-staff-picks.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

/**
 * GET /api/admin/staff-picks — List all staff picks for the admin curation panel.
 */
export async function GET(request: Request) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  const picks = await getStaffPicks();
  return Response.json({ data: picks, count: picks.length }, { headers: NO_STORE_HEADERS });
}
