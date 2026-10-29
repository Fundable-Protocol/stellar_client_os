import { authorizeAdminRequest } from "@/lib/admin-auth";
import { QuadraticFundingService } from "@/services/quadratic-funding.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

/**
 * POST /api/quadratic-funding/:roundId/distribute — Trigger automated
 * distribution of matching funds at round conclusion.
 * Requires admin authentication.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  const { roundId } = await params;

  try {
    const service = new QuadraticFundingService();
    const result = await service.distributeMatching(roundId);

    return Response.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to distribute matching:", error);
    return Response.json(
      { error: "Failed to distribute matching funds" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
