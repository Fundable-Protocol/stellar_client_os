import { NextRequest, NextResponse } from "next/server";
import {
  generateCampaignImpactReport,
  getCampaignImpactReport,
} from "@/services/automated-campaign-impact-report.service";

export const runtime = "nodejs";

/**
 * GET /api/reports/campaign/[id]/close
 * Retrieve the status and metadata for a campaign's close impact report.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const report = await getCampaignImpactReport(id);
    if (!report) {
      return NextResponse.json(
        { error: "Impact report not found for campaign" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: report.id,
      campaignId: report.campaignId,
      campaignName: report.campaignName,
      creator: report.creator,
      creatorEmail: report.creatorEmail,
      status: report.status,
      generatedAt: report.generatedAt,
      closedAt: report.closedAt,
      publicUrl: report.publicUrl,
      publicShareUrl: report.publicShareUrl,
      downloadUrl: report.downloadUrl,
      emailSent: report.emailSent,
      campaignPerformance: report.campaignPerformance,
      demographics: report.demographics,
      statedProjectImpact: report.statedProjectImpact,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/reports/campaign/[id]/close
 * Trigger impact report generation for a campaign.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  try {
    const report = await generateCampaignImpactReport(id, { baseUrl, force: true });
    return NextResponse.json({
      success: true,
      report: {
        id: report.id,
        campaignId: report.campaignId,
        campaignName: report.campaignName,
        creator: report.creator,
        creatorEmail: report.creatorEmail,
        status: report.status,
        generatedAt: report.generatedAt,
        closedAt: report.closedAt,
        publicUrl: report.publicUrl,
        publicShareUrl: report.publicShareUrl,
        downloadUrl: report.downloadUrl,
        emailSent: report.emailSent,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
