import { QuadraticFundingService } from "@/services/quadratic-funding.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

/**
 * POST /api/quadratic-funding/estimate-match — Calculate estimated matching
 * allocation for a project in real-time during checkout.
 * 
 * Body: { roundId: string, projectAddress: string, contributionAmount: string }
 * 
 * Returns: { estimatedMatch: string, totalAllocation: string, contributorCount: number }
 */
export async function POST(request: Request) {
  let body: { roundId?: unknown; projectAddress?: unknown; contributionAmount?: unknown };
  
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (
    typeof body.roundId !== "string" ||
    typeof body.projectAddress !== "string" ||
    typeof body.contributionAmount !== "string"
  ) {
    return Response.json(
      { error: "Missing required fields: roundId, projectAddress, contributionAmount" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const service = new QuadraticFundingService();
    const result = await service.estimateMatch(
      body.roundId,
      body.projectAddress,
      body.contributionAmount
    );

    return Response.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to estimate match:", error);
    return Response.json(
      { error: "Failed to calculate estimated match" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
