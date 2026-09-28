import { NextRequest, NextResponse } from "next/server";
import { getCampaign } from "@/services/campaign.service";
import {
  buildCampaignImpactReportPdf,
  type CampaignImpactReportInput,
} from "@/services/campaign-impact-report.service";

export const runtime = "nodejs";

/**
 * GET /api/reports/campaign/[id]
 *
 * Generate and download a campaign impact report PDF for the given campaign.
 *
 * Optional query params:
 *   - speciesBreakdown: JSON-encoded SpeciesBreakdownEntry[] for per-species data
 *
 * Issue #985.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  let speciesBreakdown: CampaignImpactReportInput["speciesBreakdown"] | undefined;
  const rawBreakdown = request.nextUrl.searchParams.get("speciesBreakdown");
  if (rawBreakdown) {
    try {
      const parsed = JSON.parse(rawBreakdown);
      if (Array.isArray(parsed)) {
        speciesBreakdown = parsed;
      }
    } catch {
      return NextResponse.json(
        { error: "speciesBreakdown must be a valid JSON array" },
        { status: 400 },
      );
    }
  }

  try {
    const pdfBytes = await buildCampaignImpactReportPdf({ campaign, speciesBreakdown });
    const slug     = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const date     = new Date().toISOString().slice(0, 10);
    const filename = `fundable-impact-${slug}-${date}.pdf`;

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length":      pdfBytes.byteLength.toString(),
        "Cache-Control":       "private, no-store",
      },
    });
  } catch (err) {
    console.error("[api/reports/campaign] PDF generation failed", err);
    return NextResponse.json(
      { error: "Unable to generate impact report" },
      { status: 500 },
    );
  }
}