import { authorizeAdminRequest } from "@/lib/admin-auth";
import { QuadraticFundingService } from "@/services/quadratic-funding.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

/**
 * POST /api/quadratic-funding/rounds — Create a new quadratic funding round.
 * Requires admin authentication.
 * 
 * Body: {
 *   token: string,
 *   matchingPool: string,
 *   startTime: number,
 *   endTime: number,
 *   minContribution: string
 * }
 */
export async function POST(request: Request) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  let body: {
    token?: unknown;
    matchingPool?: unknown;
    startTime?: unknown;
    endTime?: unknown;
    minContribution?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (
    typeof body.token !== "string" ||
    typeof body.matchingPool !== "string" ||
    typeof body.startTime !== "number" ||
    typeof body.endTime !== "number" ||
    typeof body.minContribution !== "string"
  ) {
    return Response.json(
      { error: "Missing or invalid required fields" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const service = new QuadraticFundingService();
    const roundId = await service.createRound({
      token: body.token,
      matchingPool: body.matchingPool,
      startTime: body.startTime,
      endTime: body.endTime,
      minContribution: body.minContribution,
    });

    return Response.json({ roundId }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to create round:", error);
    return Response.json(
      { error: "Failed to create funding round" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * GET /api/quadratic-funding/rounds — List all funding rounds.
 */
export async function GET() {
  try {
    const service = new QuadraticFundingService();
    const rounds = await service.listRounds();

    return Response.json({ rounds }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to list rounds:", error);
    return Response.json(
      { error: "Failed to list funding rounds" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
