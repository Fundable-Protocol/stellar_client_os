/**
 * Live streaming URL parsing, validation, and secure embed construction
 * (issue #1225).
 *
 * Campaign creators may only attach YouTube Live or Twitch broadcasts to a
 * campaign. Every URL is parsed here into a small typed reference before it is
 * persisted, and embeds are *built* from that reference — user-supplied URLs
 * are never handed to an iframe `src` directly.
 */

export const LIVE_STREAM_PLATFORMS = ["youtube", "twitch"] as const;

export type LiveStreamPlatform = (typeof LIVE_STREAM_PLATFORMS)[number];

/** Provider-reported lifecycle of a campaign's configured stream. */
export type LiveStreamStatus = "live" | "offline" | "unknown";

/** Stream metadata persisted on a campaign record. */
export interface CampaignLiveStream {
  platform: LiveStreamPlatform;
  /** Canonical watch URL for the broadcast. */
  streamUrl: string;
  /** Canonical replay/VOD URL, preserved after the live event ends. */
  replayUrl?: string;
  /** Optional creator-supplied label shown above the player. */
  title?: string;
  addedAt: number;
  updatedAt: number;
}

export type ParsedLiveStreamUrl =
  | { ok: true; platform: "youtube"; kind: "video"; videoId: string; canonicalUrl: string }
  | { ok: true; platform: "twitch"; kind: "channel"; channel: string; canonicalUrl: string }
  | { ok: true; platform: "twitch"; kind: "video"; videoId: string; canonicalUrl: string }
  | { ok: false; error: string };

/** Longest URL we are willing to parse (defensive against abusive input). */
export const MAX_LIVE_STREAM_URL_LENGTH = 500;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "gaming.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

const TWITCH_HOSTS = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);

/** YouTube video ids are always 11 URL-safe base64url characters. */
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
/** Twitch channel names: 3-25 alphanumeric/underscore characters. */
const TWITCH_CHANNEL_PATTERN = /^[A-Za-z0-9_]{3,25}$/;
const TWITCH_VIDEO_ID_PATTERN = /^\d{1,20}$/;

function fail(error: string): ParsedLiveStreamUrl {
  return { ok: false, error };
}

function invalidUrl(): ParsedLiveStreamUrl {
  return fail("Enter a valid YouTube or Twitch stream URL");
}

function parseYouTube(url: URL): ParsedLiveStreamUrl {
  const host = url.hostname;
  let videoId: string | undefined;

  if (host === "youtu.be" || host === "www.youtu.be") {
    const segment = url.pathname.split("/").filter(Boolean)[0];
    if (segment) videoId = segment;
  } else {
    const segments = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/watch" || segments[0] === "embed" || segments[0] === "shorts" || segments[0] === "v") {
      videoId = url.searchParams.get("v") ?? segments[1];
    } else if (segments[0] === "live") {
      videoId = segments[1];
    } else if (url.pathname === "/" && url.searchParams.get("v")) {
      videoId = url.searchParams.get("v") ?? undefined;
    }
  }

  if (!videoId) {
    return fail(
      "Use a direct YouTube video or live URL (https://www.youtube.com/watch?v=... or https://youtu.be/...)",
    );
  }
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    return fail("That YouTube URL does not contain a valid video ID");
  }
  return {
    ok: true,
    platform: "youtube",
    kind: "video",
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function parseTwitch(url: URL): ParsedLiveStreamUrl {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return fail("Use a Twitch channel (https://www.twitch.tv/<channel>) or video URL");
  }
  if (segments.length === 1) {
    const candidate = segments[0];
    if (candidate === "directory" || candidate === "downloads" || candidate === "search") {
      return fail("Use a Twitch channel or video URL, not a browse page");
    }
    if (!TWITCH_CHANNEL_PATTERN.test(candidate)) {
      return fail("That Twitch URL does not contain a valid channel name");
    }
    const channel = candidate.toLowerCase();
    return { ok: true, platform: "twitch", kind: "channel", channel, canonicalUrl: `https://www.twitch.tv/${channel}` };
  }
  if (segments.length === 2 && segments[0] === "videos" && TWITCH_VIDEO_ID_PATTERN.test(segments[1])) {
    return {
      ok: true,
      platform: "twitch",
      kind: "video",
      videoId: segments[1],
      canonicalUrl: `https://www.twitch.tv/videos/${segments[1]}`,
    };
  }
  return fail("Clips and sub-page URLs are not supported. Use a Twitch channel or /videos/<id> URL");
}

/**
 * Parse and validate a user-supplied stream URL.
 *
 * Accepts only http(s) URLs whose hostname exactly matches an official
 * YouTube or Twitch host (no suffix spoofing such as `youtube.com.evil.io`),
 * never contains embedded credentials, and resolves to a resolvable video id
 * or channel name. Successful results carry a canonical https URL with
 * tracking parameters stripped.
 */
export function parseLiveStreamUrl(raw: unknown): ParsedLiveStreamUrl {
  if (typeof raw !== "string") return invalidUrl();
  const trimmed = raw.trim();
  if (!trimmed) return fail("Stream URL is required");
  if (trimmed.length > MAX_LIVE_STREAM_URL_LENGTH) {
    return fail(`Stream URL must be ${MAX_LIVE_STREAM_URL_LENGTH} characters or fewer`);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return fail("Enter a valid URL including https://");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return fail("Stream URL must use http:// or https://");
  }
  if (url.username || url.password) {
    return fail("Stream URL must not contain embedded credentials");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    return fail("Stream URL must not specify a custom port");
  }

  const host = url.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) return parseYouTube(url);
  if (TWITCH_HOSTS.has(host)) return parseTwitch(url);
  return fail("Only YouTube and Twitch stream URLs are supported");
}

/** Convenience predicate for zod refinements and guards. */
export function isValidLiveStreamUrl(raw: unknown): boolean {
  return parseLiveStreamUrl(raw).ok;
}

/**
 * Resolve the platform stored alongside a URL, re-parsing the URL itself as a
 * defence-in-depth check so a tampered record can never reach an iframe.
 * Returns `null` when the URL no longer validates for the stored platform.
 */
export function resolveLiveStreamPlatform(
  platform: LiveStreamPlatform,
  url: unknown,
): ParsedLiveStreamUrl | null {
  const parsed = parseLiveStreamUrl(url);
  if (!parsed.ok) return null;
  if (parsed.platform !== platform) return null;
  return parsed;
}

export interface LiveStreamEmbedOptions {
  /**
   * Domain the player is embedded on. Twitch's player refuses to render
   * unless `parent` matches the embedding host, so client code passes
   * `window.location.hostname`.
   */
  parent?: string;
}

/**
 * Build a provider-hosted embed URL for a validated stream reference.
 *
 * Never returns a URL outside the two allow-listed embed origins
 * (`www.youtube-nocookie.com`, `player.twitch.tv`); returns `null` when the
 * input does not re-validate, so callers fall back to plain links.
 */
export function buildLiveStreamEmbedUrl(
  stream: { platform: LiveStreamPlatform; url: string },
  options: LiveStreamEmbedOptions = {},
): string | null {
  const parsed = resolveLiveStreamPlatform(stream.platform, stream.url);
  if (!parsed) return null;

  if (parsed.platform === "youtube") {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(parsed.videoId)}?rel=0`;
  }

  const parent = options.parent?.trim().toLowerCase();
  if (!parent) return null;
  if (parsed.kind === "channel") {
    return `https://player.twitch.tv/?channel=${encodeURIComponent(parsed.channel)}&parent=${encodeURIComponent(parent)}`;
  }
  return `https://player.twitch.tv/?video=${encodeURIComponent(parsed.videoId)}&parent=${encodeURIComponent(parent)}`;
}

/** Human-readable provider label used in links and headings. */
export function formatLiveStreamPlatform(platform: LiveStreamPlatform): string {
  return platform === "youtube" ? "YouTube" : "Twitch";
}
