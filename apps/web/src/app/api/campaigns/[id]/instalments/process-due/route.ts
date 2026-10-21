import { NextRequest, NextResponse } from "next/server";
import { campaignInstalmentsService } from "@/services/campaign-instalments.service";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * POST /api/campaigns/:id/instalments/process-due
 * Process scheduled instalments that are due (e.g. at campaign close or monthly trigger)
 * Acceptance Criterion 3: First instalment charged at campaign close; subsequent on monthly schedule
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      asOfTimestamp?: number;
    };

    const result = await campaignInstalmentsService.processDueInstalments(
      body.asOfTimestamp || Date.now(),
    );

    // Filter to instalments of this campaign if needed
    return NextResponse.json({ success: true, result, campaignId: id }, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to process due instalments" },
      { status: 500, headers: NO_STORE },
    );
  }
}
