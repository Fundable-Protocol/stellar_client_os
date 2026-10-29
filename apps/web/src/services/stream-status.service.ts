import {
  parseLiveStreamUrl,
  type CampaignLiveStream,
  type LiveStreamPlatform,
  type LiveStreamStatus,
} from "@/lib/live-stream";

/**
 * Server-side live-status resolution for campaign streams (issue #1225).
 *
 * The indicator shown on campaign cards is driven by provider APIs — never by
 * the mere existence of a stored URL. Providers are queried with credentials
 * from the server environment; when credentials are missing or a provider
 * errors, the status degrades to "unknown" and callers must not claim "live".
 *
 * Results are cached in-process with short TTLs so list endpoints can enrich
 * many campaigns without hammering the providers.
 */

export type StreamStatusSource = "provider" | "cache";

export type StreamStatusReason = "not_configured" | "provider_error" | "unsupported_url";

export interface StreamStatusResult {
  status: LiveStreamStatus;
  /** Epoch milliseconds at which the provider (or cache) produced this value. */
  checkedAt: number;
  provider: LiveStreamPlatform;
  source: StreamStatusSource;
  /** Present when `status` is "unknown". */
  reason?: StreamStatusReason;
}

export interface StreamStatusOptions {
  /** Injectable for tests; defaults to the runtime `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Injectable environment map for tests; defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

/** A confirmed-live stream is re-checked frequently so cards go stale-proof. */
export const LIVE_STATUS_TTL_MS = 60_000;
/** Offline and unknown results are re-checked more lazily. */
export const OFFLINE_STATUS_TTL_MS = 300_000;
export const UNKNOWN_STATUS_TTL_MS = 60_000;

interface CacheEntry {
  status: LiveStreamStatus;
  checkedAt: number;
  provider: LiveStreamPlatform;
  reason?: StreamStatusReason;
  expiresAt: number;
}

const statusCache = new Map<string, CacheEntry>();

/** Clear the in-process status cache (tests, manual refresh). */
export function resetLiveStreamStatusCache(): void {
  statusCache.clear();
}

function ttlFor(status: LiveStreamStatus): number {
  if (status === "live") return LIVE_STATUS_TTL_MS;
  if (status === "offline") return OFFLINE_STATUS_TTL_MS;
  return UNKNOWN_STATUS_TTL_MS;
}

function unknownResult(
  provider: LiveStreamPlatform,
  reason: StreamStatusReason,
  now: number,
): Omit<StreamStatusResult, "source"> {
  return { status: "unknown", checkedAt: now, provider, reason };
}

async function checkYouTube(
  videoId: string,
  options: StreamStatusOptions,
  now: number,
): Promise<Omit<StreamStatusResult, "source">> {
  const apiKey = (options.env ?? process.env).YOUTUBE_API_KEY;
  if (!apiKey) return unknownResult("youtube", "not_configured", now);

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "liveStreamingDetails");
    url.searchParams.set("id", videoId);
    url.searchParams.set("key", apiKey);
    const response = await (options.fetchImpl ?? fetch)(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return unknownResult("youtube", "provider_error", now);

    const payload = (await response.json()) as {
      items?: Array<{
        liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string };
      }>;
    };
    const details = payload.items?.[0]?.liveStreamingDetails;
    if (!details) return { status: "offline", checkedAt: now, provider: "youtube" };
    const isLive = Boolean(details.actualStartTime) && !details.actualEndTime;
    return { status: isLive ? "live" : "offline", checkedAt: now, provider: "youtube" };
  } catch {
    return unknownResult("youtube", "provider_error", now);
  }
}

async function checkTwitch(
  parsed: { kind: "channel" | "video"; channel?: string; videoId?: string },
  options: StreamStatusOptions,
  now: number,
): Promise<Omit<StreamStatusResult, "source">> {
  // A stored VOD reference can never be a live broadcast.
  if (parsed.kind === "video") return { status: "offline", checkedAt: now, provider: "twitch" };

  const clientId = (options.env ?? process.env).TWITCH_CLIENT_ID;
  const appToken = (options.env ?? process.env).TWITCH_APP_TOKEN;
  if (!clientId || !appToken) return unknownResult("twitch", "not_configured", now);

  try {
    const url = new URL("https://api.twitch.tv/helix/streams");
    url.searchParams.set("user_login", parsed.channel ?? "");
    const response = await (options.fetchImpl ?? fetch)(url.toString(), {
      headers: {
        Accept: "application/json",
        "Client-Id": clientId,
        Authorization: `Bearer ${appToken}`,
      },
    });
    if (!response.ok) return unknownResult("twitch", "provider_error", now);

    const payload = (await response.json()) as { data?: unknown[] };
    const isLive = Array.isArray(payload.data) && payload.data.length > 0;
    return { status: isLive ? "live" : "offline", checkedAt: now, provider: "twitch" };
  } catch {
    return unknownResult("twitch", "provider_error", now);
  }
}

/**
 * Resolve the live status of a configured campaign stream.
 *
 * The stored URL is re-parsed before any provider call; malformed or
 * tampered records short-circuit to "unknown" without a network request.
 */
export async function getLiveStreamStatus(
  stream: CampaignLiveStream,
  options: StreamStatusOptions = {},
): Promise<StreamStatusResult> {
  const now = (options.now ?? Date.now)();
  const cacheKey = `${stream.platform}:${stream.streamUrl}`;
  const cached = statusCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      status: cached.status,
      checkedAt: cached.checkedAt,
      provider: cached.provider,
      reason: cached.reason,
      source: "cache",
    };
  }

  const parsed = parseLiveStreamUrl(stream.streamUrl);
  let result: Omit<StreamStatusResult, "source">;
  if (!parsed.ok || parsed.platform !== stream.platform) {
    result = unknownResult(stream.platform, "unsupported_url", now);
  } else if (parsed.platform === "youtube") {
    result = await checkYouTube(parsed.videoId, options, now);
  } else {
    result = await checkTwitch(
      { kind: parsed.kind, channel: parsed.kind === "channel" ? parsed.channel : undefined, videoId: parsed.kind === "video" ? parsed.videoId : undefined },
      options,
      now,
    );
  }

  statusCache.set(cacheKey, {
    status: result.status,
    checkedAt: result.checkedAt,
    provider: result.provider,
    reason: result.reason,
    expiresAt: now + ttlFor(result.status),
  });

  return { ...result, source: "provider" };
}

/**
 * Resolve statuses for many campaigns at once (campaign list enrichment).
 * Only campaigns with a configured stream appear in the returned map.
 */
export async function getLiveStreamStatusForCampaigns(
  campaigns: Array<{ id: string; liveStream?: CampaignLiveStream }>,
  options: StreamStatusOptions = {},
): Promise<Map<string, StreamStatusResult>> {
  const map = new Map<string, StreamStatusResult>();
  const withStreams = campaigns.filter((campaign) => campaign.liveStream);
  const results = await Promise.all(
    withStreams.map(async (campaign) => {
      const status = await getLiveStreamStatus(campaign.liveStream as CampaignLiveStream, options);
      return [campaign.id, status] as const;
    }),
  );
  for (const [id, status] of results) map.set(id, status);
  return map;
}
