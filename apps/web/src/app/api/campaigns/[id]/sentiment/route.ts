import {
  analyzeCampaign,
  getCampaignSentiment,
} from "@/services/campaign-sentiment.service";
import type { SponsorFeedback } from "@/lib/sentiment";

export const runtime = "nodejs";

/**
 * POST /api/campaigns/[id]/sentiment
 * Body: `{ feedback: [{ id, comment, rating? }] }`
 * Analyzes sponsor comments and stores the result.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { feedback?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const raw = Array.isArray(body.feedback) ? body.feedback : [];
  const feedback: SponsorFeedback[] = raw.map((item, index) => {
    const rec = (item ?? {}) as Record<string, unknown>;
    return {
      id: String(rec.id ?? `comment-${index}`),
      comment: String(rec.comment ?? ""),
      rating:
        typeof rec.rating === "number" && rec.rating >= 1 && rec.rating <= 5
          ? rec.rating
          : undefined,
    };
  });

  if (feedback.length === 0) {
    return Response.json({ error: "feedback array is required" }, { status: 400 });
  }

  const record = await analyzeCampaign(id, feedback);
  return Response.json(record, { status: 200 });
}

/**
 * GET /api/campaigns/[id]/sentiment
 * Returns the stored analysis (404 if the campaign has never been analyzed).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = await getCampaignSentiment(id);

  if (!record) {
    return Response.json(
      { error: "no sentiment analysis stored for this campaign" },
      { status: 404 },
    );
  }

  return Response.json(record, {
    headers: record.sentiment.needsOutreach
      ? { "X-Sentiment-Flagged": "true" }
      : undefined,
  });
}
