import { NextRequest, NextResponse } from "next/server";
import { getCreatorImpactReports } from "@/services/automated-campaign-impact-report.service";

export const runtime = "nodejs";

/**
 * GET /api/creators/[address]/impact-reports
 *
 * Retrieve all campaign close impact reports for a creator's dashboard.
 * Acceptance criterion: Creator receives report in dashboard.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!address || !address.trim()) {
    return NextResponse.json({ error: "Creator address is required" }, { status: 400 });
  }

  try {
    const reports = await getCreatorImpactReports(address.trim());
    return NextResponse.json({
      creator: address.trim(),
      count: reports.length,
      reports: reports.map((r) => ({
        id: r.id,
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        creator: r.creator,
        status: r.status,
        generatedAt: r.generatedAt,
        closedAt: r.closedAt,
        publicUrl: r.publicUrl,
        publicShareUrl: r.publicShareUrl,
        downloadUrl: r.downloadUrl,
        emailSent: r.emailSent,
        campaignPerformance: r.campaignPerformance,
        demographicsCount: r.demographics.length,
        treeCount: r.campaignPerformance.treeCount,
        co2KgPerYear: r.campaignPerformance.co2KgPerYear,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load creator reports";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
