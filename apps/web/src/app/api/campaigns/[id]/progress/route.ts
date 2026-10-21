import { campaignProgressCache } from "@/services/campaign-progress-cache.service";
import { campaignMilestoneNotifier } from "@/services/campaign-milestone-notifier.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const url = new URL(request.url);
  const forceRefresh =
    url.searchParams.get("refresh") === "true" ||
    request.headers.get("cache-control") === "no-cache";

  try {
    const { metrics, cacheHit } = await campaignProgressCache.getOrFetch(
      id,
      forceRefresh
    );

    // Evaluate milestones and dispatch email notifications to the
    // campaign creator when new thresholds are reached. Failures must not
    // break the progress response, so errors are logged and swallowed.
    try {
      await campaignMilestoneNotifier.evaluateAndNotify(id, metrics);
    } catch (notifyErr: any) {
      console.error(
        `[campaign-progress] Failed to dispatch milestone notifications for campaign ${id}`,
        notifyErr
      );
    }

    return Response.json(
      {
        ...metrics,
        cacheStatus: cacheHit ? "HIT" : "MISS",
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
          "X-Cache": cacheHit ? "HIT" : "MISS",
        },
      }
    );
  } catch (err: any) {
    if (err.message && err.message.includes("not found")) {
      return Response.json({ error: "Campaign not found" }, { status: 404 });
    }
    return Response.json(
      { error: "Failed to retrieve campaign progress metrics" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const invalidated = campaignProgressCache.invalidate(id);
  return Response.json({
    campaignId: id,
    invalidated,
    message: invalidated
      ? "Campaign progress cache purged"
      : "No cached entry found for campaign",
  });
}
