"use client";

import React, { useCallback, useContext, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { WalletContext } from "@/providers/StellarWalletProvider";
import { CampaignLiveStreamPlayer } from "./CampaignLiveStreamPlayer";
import { CampaignLiveStreamManager } from "./CampaignLiveStreamManager";
import type { CampaignStreamConfigResponse, CampaignStreamStatusResponse } from "@/types/live-stream";
import { cn } from "@/lib/utils";

export interface CampaignLiveStreamSectionProps {
  campaignId: string;
  className?: string;
}

/** How often the provider-backed status is re-checked while the page is open. */
const STATUS_POLL_INTERVAL_MS = 60_000;

type LoadState<T> =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: T };

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? body.error : undefined;
    throw new Error(message ?? "Request failed");
  }
  return body as T;
}

/**
 * Campaign-page live-stream area (issue #1225).
 *
 * Loads the persisted stream metadata and its provider-backed status, renders
 * the public player (or nothing when there is no stream), and mounts the
 * management form only for the campaign creator's connected wallet.
 */
export function CampaignLiveStreamSection({ campaignId, className }: CampaignLiveStreamSectionProps) {
  const wallet = useContext(WalletContext);
  const address = wallet?.address ?? null;

  const [reloadKey, setReloadKey] = useState(0);
  const [config, setConfig] = useState<LoadState<CampaignStreamConfigResponse>>({ phase: "loading" });
  const [status, setStatus] = useState<LoadState<CampaignStreamStatusResponse>>({ phase: "loading" });

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  // A new campaign id invalidates whatever the previous fetch produced.
  useEffect(() => {
    setConfig({ phase: "loading" });
    setStatus({ phase: "loading" });
  }, [campaignId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [configResult, statusResult] = await Promise.allSettled([
        fetchJson<CampaignStreamConfigResponse>(`/api/campaigns/${encodeURIComponent(campaignId)}/stream`),
        fetchJson<CampaignStreamStatusResponse>(
          `/api/campaigns/${encodeURIComponent(campaignId)}/stream-status`,
        ),
      ]);
      if (cancelled) return;
      if (configResult.status === "fulfilled") {
        setConfig({ phase: "ready", data: configResult.value });
      } else {
        // Keep successfully loaded data on transient refetch failures so a
        // failed poll never blanks an already-rendered player.
        setConfig((prev) =>
          prev.phase === "ready"
            ? prev
            : { phase: "error", message: configResult.reason?.message ?? "Request failed" },
        );
      }
      if (statusResult.status === "fulfilled") {
        setStatus({ phase: "ready", data: statusResult.value });
      } else {
        setStatus((prev) =>
          prev.phase === "ready"
            ? prev
            : { phase: "error", message: statusResult.reason?.message ?? "Request failed" },
        );
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [campaignId, reloadKey]);

  // Keep the live indicator honest while the page stays open.
  useEffect(() => {
    const timer = setInterval(reload, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  if (config.phase === "loading") {
    return (
      <div
        className={cn("space-y-4", className)}
        data-testid="live-stream-loading"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">Loading campaign live stream</span>
        <div className="h-6 w-48 animate-pulse rounded-md bg-zinc-800" />
        <div className="aspect-video w-full animate-pulse rounded-lg bg-zinc-900" />
      </div>
    );
  }

  if (config.phase === "error") {
    return (
      <div
        className={cn("rounded-xl border border-red-900/60 bg-red-950/30 p-6", className)}
        role="alert"
        data-testid="live-stream-error"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-zinc-50">Unable to load the campaign stream</h2>
            <p className="text-sm text-red-200/80">
              {config.message || "Something went wrong while fetching stream data."}
            </p>
            <button
              type="button"
              onClick={reload}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-800/70 bg-red-950/40 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-950/70"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const liveStream = config.data.liveStream;
  const isCreator = Boolean(address && address === config.data.creator);
  if (!liveStream && !isCreator) return null;

  const statusData = status.phase === "ready" ? status.data : null;
  const statusUnavailable = status.phase === "error";

  return (
    <section
      aria-label="Campaign live stream"
      data-testid="campaign-live-stream-section"
      className={cn("space-y-6", className)}
    >
      {liveStream && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <CampaignLiveStreamPlayer
            platform={liveStream.platform}
            streamUrl={liveStream.streamUrl}
            replayUrl={liveStream.replayUrl}
            title={liveStream.title}
            status={statusData?.status ?? null}
            statusUnavailable={statusUnavailable}
          />
        </div>
      )}
      {isCreator && (
        <CampaignLiveStreamManager
          campaignId={campaignId}
          liveStream={liveStream}
          onChanged={reload}
        />
      )}
    </section>
  );
}
