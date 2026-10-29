import { getCampaign } from "@/services/campaign.service";
import { getLiveStreamStatus } from "@/services/stream-status.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

/**
 * GET /api/campaigns/[id]/stream-status
 *
 * Provider-backed live status for a campaign's configured stream. The response
 * is `status: null` when no stream is configured and `status: "unknown"` when
 * the provider cannot be consulted (missing credentials or provider error) —
 * clients must only show a live indicator for an explicit `"live"` result.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaign = await getCampaign((await params).id);
  if (!campaign) {
    return Response.json({ error: "Campaign not found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const stream = campaign.liveStream;
  if (!stream) {
    return Response.json(
      { campaignId: campaign.id, liveStream: null, status: null, checkedAt: null, source: null },
      { headers: NO_STORE_HEADERS },
    );
  }

  try {
    const result = await getLiveStreamStatus(stream);
    return Response.json(
      {
        campaignId: campaign.id,
        liveStream: {
          platform: stream.platform,
          streamUrl: stream.streamUrl,
          replayUrl: stream.replayUrl ?? null,
          title: stream.title ?? null,
        },
        status: result.status,
        checkedAt: result.checkedAt,
        source: result.source,
        reason: result.reason ?? null,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return Response.json(
      {
        campaignId: campaign.id,
        liveStream: {
          platform: stream.platform,
          streamUrl: stream.streamUrl,
          replayUrl: stream.replayUrl ?? null,
          title: stream.title ?? null,
        },
        status: "unknown",
        checkedAt: Date.now(),
        source: "provider",
        reason: "provider_error",
      },
      { headers: NO_STORE_HEADERS },
    );
  }
}
