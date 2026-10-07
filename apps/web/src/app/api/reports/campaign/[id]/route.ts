import { NextRequest, NextResponse } from "next/server";
import { getCampaign, type CampaignRecord } from "@/services/campaign.service";
import {
  buildCampaignImpactReportPdf,
  type CampaignImpactReportInput,
  type SpeciesBreakdownEntry,
} from "@/services/campaign-impact-report.service";
import { getTreeSpecies } from "@/lib/co2-impact";

export const runtime = "nodejs";

/**
 * Derive a species breakdown from the campaign record when the caller does not
 * supply an explicit one. Uses the campaign's `speciesId`/`species` fields and
 * the per-species CO2 rate from `TREE_SPECIES`; falls back to a single mixed
 * row derived from `treeCount` when no species is recorded.
 */
function deriveSpeciesBreakdown(campaign: CampaignRecord): SpeciesBreakdownEntry[] | undefined {
  if (campaign.treeCount <= 0) return undefined;

  if (campaign.speciesId) {
    const sp = getTreeSpecies(campaign.speciesId);
    return [{
      species: campaign.species ?? sp.label,
      count: campaign.treeCount,
      co2KgPerYear: campaign.treeCount * sp.co2PerTreePerYearKg,
    }];
  }

  if (campaign.co2SequestrationKg) {
    const totalKg = Number(campaign.co2SequestrationKg);
    if (Number.isFinite(totalKg) && totalKg > 0) {
      return [{
        species: campaign.species ?? campaign.treeSpecies ?? "Mixed species",
        count: campaign.treeCount,
        co2KgPerYear: totalKg,
      }];
    }
  }

  return undefined;
}

/**
 * GET /api/reports/campaign/[id]
 *
 * Generate and download a campaign impact report PDF for the given campaign.
 * The report includes tree count, species breakdown, CO2 sequestration,
 * sponsor names, and (when GPS data is present) a location map.
 *
 * Optional query params:
 *   - speciesBreakdown: JSON-encoded SpeciesBreakdownEntry[] for per-species
 *     data. When omitted, the breakdown is derived from the campaign record.
 *
 * Issue #849.
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
  } else {
    speciesBreakdown = deriveSpeciesBreakdown(campaign);
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
