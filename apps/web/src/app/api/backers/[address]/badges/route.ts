import { backerBadgeService } from "@/services/backer-badge.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ address: string }> }) {
  const profile = backerBadgeService.getProfile((await params).address);
  return Response.json(profile, { headers: { "Cache-Control": "private, no-store" } });
}
