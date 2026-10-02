import { getAdminAnalyticsDashboard } from "@/services/admin-analytics-dashboard.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await getAdminAnalyticsDashboard();
  return Response.json({ data }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}