import { NextRequest, NextResponse } from "next/server";
import { generatePendingCampaignCloseReports } from "@/services/automated-campaign-impact-report.service";

export const runtime = "nodejs";

/**
 * POST /api/reports/campaign/automated
 * GET  /api/reports/campaign/automated
 *
 * Automated campaign impact report generator task / cron endpoint.
 * Scans campaigns closed within the last 24 hours (or pending generation)
 * and generates the PDF impact report, emails the creator, and records it for the dashboard.
 *
 * Acceptance Criterion:
 * - Report generated within 24 hours of campaign close.
 */
export async function POST(request: NextRequest) {
  try {
    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    const reports = await generatePendingCampaignCloseReports({ baseUrl });
    return NextResponse.json({
      success: true,
      generatedCount: reports.length,
      reports: reports.map((r) => ({
        id: r.id,
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        creator: r.creator,
        creatorEmail: r.creatorEmail,
        generatedAt: r.generatedAt,
        closedAt: r.closedAt,
        publicUrl: r.publicUrl,
        publicShareUrl: r.publicShareUrl,
        downloadUrl: r.downloadUrl,
        emailSent: r.emailSent,
        status: r.status,
      })),
    });
  } catch (error) {
    console.error("[api/reports/campaign/automated] Batch generation failed:", error);
    return NextResponse.json(
      { error: "Automated report generation failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
