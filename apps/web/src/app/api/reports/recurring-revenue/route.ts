import { NextRequest } from "next/server";
import { recurringContributionService } from "@/services/recurring-contributions.service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const creatorAddress = searchParams.get("creatorAddress") || searchParams.get("creator");

  if (!creatorAddress) {
    return Response.json(
      { error: "creatorAddress query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const report = await recurringContributionService.getCreatorRecurringRevenueReport(creatorAddress);
    return Response.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
