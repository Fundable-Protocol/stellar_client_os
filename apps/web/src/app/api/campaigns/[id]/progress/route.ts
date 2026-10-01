import { campaignProgressCache } from "@/services/campaign-progress-cache.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
) {
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