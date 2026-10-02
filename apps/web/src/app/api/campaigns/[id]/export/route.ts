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
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const report = query.get("report") ?? "full";
  const format = query.get("format") ?? "csv";
  if (!["sponsors", "impact", "timeline", "full"].includes(report) || !["csv", "json"].includes(format)) {
    return Response.json({ error: "Invalid report or format. Use report=sponsors|impact|timeline|full and format=csv|json." }, { status: 400 });
  }
  if (format === "json") {
    const data = await exportCampaignJson(id);
    if (!data) return Response.json({ error: "Campaign not found" }, { status: 404 });
    return Response.json(data, { headers: { "Content-Disposition": `attachment; filename="campaign-${id}.json"`, "Cache-Control": "private, no-store" } });
  }
  const csv = await exportCampaignCsv(id, report as "sponsors" | "impact" | "timeline" | "full");
  if (csv === null) return Response.json({ error: "Campaign not found" }, { status: 404 });
  return new Response(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="campaign-${id}-${report}.csv"`, "Cache-Control": "private, no-store" } });
}
