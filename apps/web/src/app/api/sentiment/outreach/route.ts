import {
  getOutreachList,
  getSentimentSummary,
  setSentimentDataSource,
  InMemorySentimentDataSource,
} from "@/services/campaign-sentiment.service";

export const runtime = "nodejs";

/**
 * GET /api/sentiment/outreach — creator-success queue: all campaigns whose
 * sponsor sentiment is below the outreach threshold, worst first, plus a
 * summary for dashboards.
 */
export async function GET() {
  const [flagged, summary] = await Promise.all([getOutreachList(), getSentimentSummary()]);
  return Response.json({ flagged, summary });
}

/**
 * DELETE /api/sentiment/outreach — clear the sentiment store (ops reset).
 * Guarded so it only runs with the explicit reset query param.
 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("confirm") !== "reset") {
    return Response.json({ error: "pass ?confirm=reset to clear the store" }, { status: 400 });
  }
  setSentimentDataSource(new InMemorySentimentDataSource());
  return Response.json({ status: "cleared" });
}
