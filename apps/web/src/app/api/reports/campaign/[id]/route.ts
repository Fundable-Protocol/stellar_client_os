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
 *   - locationMapBase64: Base64-encoded static map image
 *   - locationMapFormat: "png" | "jpg" (defaults to "png" if image provided)
 *
 * Issues #917, #985.
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

  let locationMapBytes: Uint8Array | undefined;
  let locationMapFormat: "png" | "jpg" | undefined;
  const rawMapBase64 = request.nextUrl.searchParams.get("locationMapBase64");
  const rawFormat = request.nextUrl.searchParams.get("locationMapFormat");
  if (rawMapBase64) {
    try {
      const buffer = Buffer.from(rawMapBase64, "base64");
      locationMapBytes = new Uint8Array(buffer);
      locationMapFormat = rawFormat === "jpg" || rawFormat === "jpeg" ? "jpg" : "png";
    } catch {
      // Continue without map if invalid base64
    }
  }

  try {
    const pdfBytes = await buildCampaignImpactReportPdf({
      campaign,
      speciesBreakdown,
      locationMapBytes,
      locationMapFormat,
    });
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

/**
 * POST /api/reports/campaign/[id]
 *
 * Generate and download a campaign impact report PDF with request body options:
 * {
 *   speciesBreakdown?: SpeciesBreakdownEntry[];
 *   locationMapBase64?: string;
 *   locationMapFormat?: "png" | "jpg";
 * }
 *
 * Issue #917.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Proceed with default empty object if no JSON body provided
  }

  const speciesBreakdown = Array.isArray(body?.speciesBreakdown)
    ? (body.speciesBreakdown as CampaignImpactReportInput["speciesBreakdown"])
    : undefined;

  let locationMapBytes: Uint8Array | undefined;
  let locationMapFormat: "png" | "jpg" | undefined;
  if (typeof body?.locationMapBase64 === "string" && body.locationMapBase64.length > 0) {
    try {
      const buffer = Buffer.from(body.locationMapBase64, "base64");
      locationMapBytes = new Uint8Array(buffer);
      locationMapFormat =
        body.locationMapFormat === "jpg" || body.locationMapFormat === "jpeg"
          ? "jpg"
          : "png";
    } catch {
      // Continue without map if invalid base64
    }
  }

  try {
    const pdfBytes = await buildCampaignImpactReportPdf({
      campaign,
      speciesBreakdown,
      locationMapBytes,
      locationMapFormat,
    });
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