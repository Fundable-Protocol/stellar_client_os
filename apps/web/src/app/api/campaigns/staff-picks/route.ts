import { getStaffPicks } from "@/services/campaign-staff-picks.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/campaigns/staff-picks
 * Returns all campaigns curated as Staff Picks by the platform editorial team.
 */
export async function GET() {
  const picks = await getStaffPicks();
  return Response.json({
    data: picks,
    count: picks.length,
  });
}
