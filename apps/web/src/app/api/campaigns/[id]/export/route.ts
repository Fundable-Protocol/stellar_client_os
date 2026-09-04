import { exportCampaignCsv } from "@/services/campaign.service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const report = new URL(request.url).searchParams.get("report") ?? "sponsors";
  if (report !== "sponsors" && report !== "impact") {
    return Response.json({ error: "Invalid report. Use sponsors or impact." }, { status: 400 });
  }

  const csv = await exportCampaignCsv(id, report);
  if (csv === null) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  const filename = `campaign-${id}-${report}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
