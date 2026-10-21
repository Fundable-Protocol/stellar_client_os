import { getCampaign } from "@/services/campaign.service";
import {
  CampaignLiveStreamError,
  removeCampaignLiveStream,
  setCampaignLiveStream,
} from "@/services/campaign-live-stream.service";
import { checkCampaignRateLimit } from "@/lib/campaign-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
function noStore<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) } });
}

function errorStatus(code: CampaignLiveStreamError["code"]): number {
  if (code === "NOT_FOUND") return 404;
  if (code === "FORBIDDEN") return 403;
  return 400;
}

function streamPayload(campaign: { id: string; creator: string; liveStream?: unknown }) {
  return {
    campaignId: campaign.id,
    creator: campaign.creator,
    liveStream: (campaign.liveStream as object | undefined) ?? null,
  };
}

/**
 * GET /api/campaigns/[id]/stream
 * Public: current stream metadata plus the owner address used for writes.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaign = await getCampaign((await params).id);
  if (!campaign) return noStore({ error: "Campaign not found" }, { status: 404 });
  return noStore(streamPayload(campaign));
}

async function rateLimitOrReject(request: Request, campaign: Parameters<typeof checkCampaignRateLimit>[1]) {
  const limited = await checkCampaignRateLimit(request, campaign);
  if (!limited.allowed) {
    return noStore(
      { error: "Too many requests", code: "RATE_LIMIT_EXCEEDED", retryAfter: limited.headers["Retry-After"] },
      { status: 429, headers: limited.headers },
    );
  }
  return null;
}

/**
 * PUT /api/campaigns/[id]/stream
 * Creator-only upsert of the campaign's YouTube/Twitch stream. URLs are
 * re-validated by the service; the client-supplied identity is matched against
 * the stored campaign creator.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const campaign = await getCampaign(id);
  if (!campaign) return noStore({ error: "Campaign not found" }, { status: 404 });

  const rejected = await rateLimitOrReject(request, campaign);
  if (rejected) return rejected;

  let body: { streamUrl?: unknown; replayUrl?: unknown; title?: unknown; requestedBy?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return noStore({ error: "Invalid JSON request body" }, { status: 400 });
  }

  if (body.streamUrl === undefined) return noStore({ error: "streamUrl is required" }, { status: 400 });
  if (typeof body.requestedBy !== "string" || !body.requestedBy.trim()) {
    return noStore({ error: "requestedBy (creator address) is required" }, { status: 400 });
  }

  try {
    const updated = await setCampaignLiveStream(id, body.requestedBy, {
      streamUrl: body.streamUrl,
      replayUrl: body.replayUrl,
      title: body.title,
    });
    return noStore(streamPayload(updated));
  } catch (error) {
    if (error instanceof CampaignLiveStreamError) {
      return noStore({ error: error.message, code: error.code }, { status: errorStatus(error.code) });
    }
    return noStore({ error: "Unable to save the campaign live stream" }, { status: 500 });
  }
}

/**
 * DELETE /api/campaigns/[id]/stream
 * Creator-only removal of the stream metadata (and its replay link).
 * `requestedBy` may be supplied as a query parameter or in the body.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const campaign = await getCampaign(id);
  if (!campaign) return noStore({ error: "Campaign not found" }, { status: 404 });

  const rejected = await rateLimitOrReject(request, campaign);
  if (rejected) return rejected;

  const url = new URL(request.url);
  let requestedBy = url.searchParams.get("requestedBy");
  if (!requestedBy) {
    try {
      const body = (await request.json()) as { requestedBy?: unknown };
      if (typeof body.requestedBy === "string") requestedBy = body.requestedBy;
    } catch {
      // No body supplied — the query parameter is then the only source.
    }
  }

  try {
    const updated = await removeCampaignLiveStream(id, requestedBy);
    return noStore(streamPayload(updated));
  } catch (error) {
    if (error instanceof CampaignLiveStreamError) {
      return noStore({ error: error.message, code: error.code }, { status: errorStatus(error.code) });
    }
    return noStore({ error: "Unable to remove the campaign live stream" }, { status: 500 });
  }
}
