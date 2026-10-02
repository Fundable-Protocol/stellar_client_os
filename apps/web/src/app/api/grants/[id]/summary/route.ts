import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getGrantProgramService } from "@/services/grant-program.service";

const SummaryQuerySchema = z.object({
  campaignId: z.string().min(1),
});

/**
 * GET /api/grants/:id/summary?campaignId=...
 *
 * Returns the matching summary for a campaign within a grant program:
 * eligibility, total already matched, and the next match amount available.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = SummaryQuerySchema.safeParse({
    campaignId: request.nextUrl.searchParams.get("campaignId"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "campaignId query parameter is required", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const summary = await getGrantProgramService().getProgramSummary(id, parsed.data.campaignId);
  if (!summary) {
    return NextResponse.json({ error: "Grant program not found" }, { status: 404 });
  }
  return NextResponse.json({ data: summary });
}