"use client";

import React, { useEffect, useState } from "react";
import { ExternalLink, Film, Radio } from "lucide-react";
import { LiveStreamBadge } from "./LiveStreamBadge";
import {
  buildLiveStreamEmbedUrl,
  formatLiveStreamPlatform,
  parseLiveStreamUrl,
  type LiveStreamPlatform,
  type LiveStreamStatus,
} from "@/lib/live-stream";
import { cn } from "@/lib/utils";

export interface CampaignLiveStreamPlayerProps {
  platform: LiveStreamPlatform;
  streamUrl: string;
  replayUrl?: string | null;
  title?: string | null;
  /** Provider-backed status; `null`/`"unknown"` never renders a live claim. */
  status?: LiveStreamStatus | null;
  /** True when the status endpoint itself could not be reached. */
  statusUnavailable?: boolean;
  className?: string;
}

/**
 * Public, read-only player for a campaign's configured stream.
 *
 * The iframe `src` is always derived by `buildLiveStreamEmbedUrl`, which only
 * emits allow-listed provider embed origins from a re-validated URL — a
 * tampered record can never turn into an arbitrary embed. When the broadcast
 * ends, the persisted replay link stays rendered below the player.
 */
export function CampaignLiveStreamPlayer({
  platform,
  streamUrl,
  replayUrl,
  title,
  status,
  statusUnavailable = false,
  className,
}: CampaignLiveStreamPlayerProps) {
  const isLive = status === "live";
  const platformLabel = formatLiveStreamPlatform(platform);

  // Twitch's player refuses to render unless `parent` matches the embedding
  // host, so the value is resolved after mount in the browser.
  const [embedParent, setEmbedParent] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname) {
      setEmbedParent(window.location.hostname);
    }
  }, []);

  // While offline, prefer the persisted replay as the embed source so a
  // finished broadcast resolves straight to the recording.
  const embedSourceUrl = !isLive && replayUrl ? replayUrl : streamUrl;
  const parsedEmbedSource = parseLiveStreamUrl(embedSourceUrl);
  const embedUrl =
    parsedEmbedSource.ok
      ? buildLiveStreamEmbedUrl(
          { platform: parsedEmbedSource.platform, url: parsedEmbedSource.canonicalUrl },
          { parent: embedParent },
        )
      : null;

  const isTwitch = platform === "twitch";
  const awaitingParent = isTwitch && embedUrl === null && Boolean(parsedEmbedSource.ok);

  const replayHref = !isLive ? replayUrl || streamUrl : streamUrl;
  const parsedReplay = parseLiveStreamUrl(replayHref);
  const canShowReplay = !isLive && Boolean(replayUrl) && replayUrl !== streamUrl;

  const heading = title || (isLive ? `Live on ${platformLabel}` : `Campaign stream on ${platformLabel}`);

  return (
    <div className={cn("space-y-3", className)} data-testid="campaign-live-stream-player">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold text-zinc-50">
          <Radio className="h-5 w-5 text-red-400" aria-hidden="true" />
          {heading}
          <LiveStreamBadge status={status} />
        </h2>
        {isLive && (
          <span className="text-xs font-medium text-red-300">Broadcasting on {platformLabel}</span>
        )}
      </div>

      {status === "offline" && (
        <p className="text-sm text-zinc-400" data-testid="live-stream-offline-note">
          The broadcast has ended. A replay is available below.
        </p>
      )}
      {(status === "unknown" || statusUnavailable || status === null) && (
        <p className="text-sm text-zinc-500" data-testid="live-stream-status-unknown" role="status">
          {statusUnavailable
            ? "Live status is temporarily unavailable."
            : "Live status could not be verified for this stream."}
        </p>
      )}

      {embedUrl ? (
        <iframe
          src={embedUrl}
          title={`${platformLabel} ${isLive ? "live stream" : "stream player"} for this campaign`}
          className="aspect-video w-full rounded-lg border border-zinc-800 bg-black"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          data-testid="live-stream-embed"
        />
      ) : awaitingParent ? (
        <div
          className="aspect-video w-full animate-pulse rounded-lg border border-zinc-800 bg-zinc-900"
          role="status"
          aria-label="Loading stream player"
        />
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center">
          <Film className="mx-auto h-6 w-6 text-zinc-500" aria-hidden="true" />
          <p className="mt-2 text-sm text-zinc-400">This stream can no longer be embedded.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <a
          href={parsedReplay.ok ? parsedReplay.canonicalUrl : streamUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-medium text-zinc-200 transition-colors hover:border-purple-500/60 hover:text-purple-300"
          data-testid={isLive ? "live-stream-watch-link" : "live-stream-replay-link"}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          {isLive ? `Watch live on ${platformLabel}` : "Watch replay"}
        </a>
        {canShowReplay && (
          <a
            href={streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
            data-testid="live-stream-open-source-link"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            Open on {platformLabel}
          </a>
        )}
      </div>
    </div>
  );
}
