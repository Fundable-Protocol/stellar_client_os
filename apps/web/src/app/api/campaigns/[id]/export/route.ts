import {
  buildCampaignBackersCsv,
  buildCampaignExportDataset,
  buildCampaignExportPdf,
} from "@/services/campaign-export.service";
import { exportCampaign, exportCampaignCsv } from "@/services/campaign.service";

export const runtime = "nodejs";

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "campaign";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const search = new URL(request.url).searchParams;
  const format = search.get("format") ?? "csv";
  const report = search.get("report") ?? "sponsors";
  if (format !== "csv" && format !== "json") {
    return Response.json({ error: "Invalid format. Use csv or json." }, { status: 400 });
  }
  if (format === "csv" && report !== "sponsors" && report !== "impact" && report !== "all") {
    return Response.json({ error: "Invalid report. Use sponsors, impact, or all." }, { status: 400 });
  }

  if (format === "csv" && report !== "all") {
    const csv = await exportCampaignCsv(id, report as "sponsors" | "impact");
    if (csv === null) return Response.json({ error: "Campaign not found" }, { status: 404 });
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="campaign-${safeFilenamePart(id)}-${report}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const exported = await exportCampaign(id, format);
  if (exported === null) return Response.json({ error: "Campaign not found" }, { status: 404 });
  return new Response(exported.body, {
    status: 200,
    headers: {
      "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaign-${safeFilenamePart(id)}.${format}"`,
      "Cache-Control": "private, no-store",
    },
  });
import { exportCampaignCsv, exportCampaignJson } from "@/services/campaign.service";

export const runtime = "nodejs";

const REPORTS = ["sponsors", "impact", "timeline", "full", "backers", "analytics"] as const;
const FORMATS = ["csv", "json", "pdf"] as const;

type ExportReport = (typeof REPORTS)[number];
type ExportFormat = (typeof FORMATS)[number];

function filenameSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "campaign";
}

/**
 * GET /api/campaigns/:id/export
 *
 * Creator dashboard data export (issue #1184).
 *
 *   ?report=backers&format=csv   — backer list with every recorded field
 *   ?report=analytics&format=pdf — analytics PDF with funding/tier charts
 *   ?report=full&format=pdf      — the same PDF report
 *
 * The original sponsor/impact/timeline CSV + full JSON exports are preserved
 * for existing consumers.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const report = (query.get("report") ?? "full") as ExportReport;
  const format = (query.get("format") ?? "csv") as ExportFormat;

  if (!REPORTS.includes(report) || !FORMATS.includes(format)) {
    return Response.json(
      {
        error:
          "Invalid report or format. Use report=sponsors|impact|timeline|full|backers|analytics and format=csv|json|pdf.",
      },
      { status: 400 },
    );
  }

  const slug = filenameSlug(id);
  const date = new Date().toISOString().slice(0, 10);

  if (format === "pdf") {
    const dataset = await buildCampaignExportDataset(id);
    if (!dataset) return Response.json({ error: "Campaign not found" }, { status: 404 });

    try {
      const pdf = await buildCampaignExportPdf(dataset);
      return new Response(pdf as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="fundable-campaign-${slug}-${date}.pdf"`,
          "Content-Length": pdf.byteLength.toString(),
          "Cache-Control": "private, no-store",
        },
      });
    } catch (error) {
      console.error("[api/campaigns/export] PDF generation failed", error);
      return Response.json({ error: "Unable to generate campaign report" }, { status: 500 });
    }
  }

  if (format === "json") {
    const data = await exportCampaignJson(id);
    if (!data) return Response.json({ error: "Campaign not found" }, { status: 404 });
    return Response.json(data, {
      headers: {
        "Content-Disposition": `attachment; filename="campaign-${slug}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (report === "backers") {
    const csv = await buildCampaignBackersCsv(id);
    if (csv === null) return Response.json({ error: "Campaign not found" }, { status: 404 });
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fundable-campaign-${slug}-backers-${date}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (report === "analytics") {
    return Response.json(
      { error: "Analytics exports are available as PDF only. Use format=pdf." },
      { status: 400 },
    );
  }

  const csv = await exportCampaignCsv(id, report);
  if (csv === null) return Response.json({ error: "Campaign not found" }, { status: 404 });
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaign-${slug}-${report}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
