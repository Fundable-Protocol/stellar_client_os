"use client";

import { useEffect, useRef, useState } from "react";
import { FUNDING_POLL_INTERVAL_MS } from "@/lib/funding-counter";
import {
  computeImpactValue,
  tweenImpactValue,
  type ImpactMetricDefinition,
} from "@/lib/impact-metrics";

export type FundingFeedStatus = "idle" | "live" | "polling" | "not-found";

export interface FundingSnapshot {
  campaignId: string;
  goalAmount: string;
  raisedAmount: string;
  sponsorCount: number;
  updatedAt: number;
  percentFunded: number;
}

export interface UseFundingCounterResult {
  snapshot: FundingSnapshot | null;
  status: FundingFeedStatus;
  /** Epoch ms of the last accepted update (SSE or poll). */
  lastUpdated: number | null;
}

function parseAmount(value: string): number {
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Subscribe to a campaign's funding total in real time (issue #1259).
 *
 * Primary transport is the SSE stream at /api/campaigns/:id/funding-stream.
 * When SSE is unavailable in the browser, the stream ends (server data error),
 * or the campaign is unknown, the hook falls back to fetching
 * /api/campaigns/:id on a 30-second interval. While the SSE feed is healthy
 * the poller idles, so no wasted requests hit the server.
 */
export function useFundingCounter(
  campaignId: string | undefined,
  options: { pollIntervalMs?: number } = {},
): UseFundingCounterResult {
  const pollIntervalMs = options.pollIntervalMs ?? FUNDING_POLL_INTERVAL_MS;
  const [snapshot, setSnapshot] = useState<FundingSnapshot | null>(null);
  const [status, setStatus] = useState<FundingFeedStatus>("idle");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const latest = useRef({ snapshot, status });
  useEffect(() => {
    // Mirror latest state for the interval closure without re-subscribing.
    latest.current = { snapshot, status };
  }, [snapshot, status]);

  useEffect(() => {
    if (!campaignId) return undefined;

    let disposed = false;

    // ── Fallback poller ────────────────────────────────────────────────────
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };
    const applySnapshot = (next: FundingSnapshot) => {
      if (disposed) return;
      setSnapshot(next);
      setLastUpdated(Date.now());
    };

    const pollOnce = async () => {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" });
        if (!response.ok) {
          if (response.status === 404) {
            setStatus("not-found");
            stopPolling();
          }
          return;
        }
        const campaign = (await response.json()) as {
          goalAmount?: string;
          raisedAmount?: string;
          sponsorCount?: number;
          updatedAt?: number;
        };
        const raised = parseAmount(campaign.raisedAmount ?? "0");
        const goal = parseAmount(campaign.goalAmount ?? "0");
        const empty = raised === 0 && goal === 0;
        if (!campaign.goalAmount && empty) {
          // GET /api/campaigns/:id 404s as { error }; guard against a 200 with
          // no funding fields just in case.
          return;
        }
        setStatus("polling");
        applySnapshot({
          campaignId,
          goalAmount: campaign.goalAmount ?? "0",
          raisedAmount: campaign.raisedAmount ?? "0",
          sponsorCount: campaign.sponsorCount ?? 0,
          updatedAt: campaign.updatedAt ?? Date.now(),
          percentFunded: goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0,
        });
      } catch {
        // Network hiccup: keep polling.
      }
    };
    const startPolling = () => {
      if (pollTimer || disposed) return;
      stopPollingEventSource();
      setStatus((current) => (current === "not-found" ? current : "polling"));
      void pollOnce();
      pollTimer = setInterval(() => {
        if (latest.current.status === "live") return; // live feed covers updates
        void pollOnce();
      }, pollIntervalMs);
    };

    // ── SSE primary transport ─────────────────────────────────────────────
    let eventSource: EventSource | undefined;
    const stopPollingEventSource = () => {
      eventSource?.close();
      eventSource = undefined;
    };
    const connectStream = () => {
      if (disposed || typeof window === "undefined" || typeof window.EventSource !== "function") {
        startPolling();
        return;
      }
      let stream: EventSource;
      try {
        stream = new EventSource(`/api/campaigns/${campaignId}/funding-stream`);
      } catch {
        // Some browsers throw on constructor when throttled; fall back to polls.
        startPolling();
        return;
      }
      eventSource = stream;

      stream.addEventListener("funding", (event) => {
        const data = JSON.parse((event as MessageEvent<string>).data) as FundingSnapshot;
        if (data.campaignId !== campaignId) return;
        stopPolling(); // live wins; cancel any fallback poller
        setStatus("live");
        applySnapshot(data);
      });
      stream.addEventListener("not_found", () => {
        setStatus("not-found");
        stopPolling();
      });
      stream.onerror = () => {
        // Keep polling meanwhile; if the stream is terminally broken (CLOSED)
        // close it for good and let the poll keep data fresh.
        if (stream.readyState !== EventSource.CONNECTING && stream.readyState !== EventSource.OPEN) {
          stream.close();
          eventSource = undefined;
        }
        if (!pollTimer && latest.current.status !== "not-found") {
          startPolling();
        }
      };
    };

    connectStream();

    return () => {
      disposed = true;
      stopPolling();
      stopPollingEventSource();
    };
  }, [campaignId, pollIntervalMs]);

  return { snapshot, status, lastUpdated };
}

export interface UseImpactCounterResult {
  /** Latest impact number derived from the live raised amount. */
  impactValue: number;
  /** Animated value to render; eases toward impactValue. */
  displayValue: number;
  unit: string;
  metricName: string;
  status: FundingFeedStatus;
  lastUpdated: number | null;
}

/** Duration of the counter tween in milliseconds. */
const IMPACT_TWEEN_MS = 800;

/**
 * Live impact counter for a campaign (issue #1229).
 *
 * Wraps {@link useFundingCounter} to read the real-time raised amount, then
 * evaluates the creator-defined impact formula (amount raised / cost per unit)
 * on every snapshot change. The displayed value animates from the previous
 * impact number to the new one over ~800ms via requestAnimationFrame so the
 * counter visibly ticks up as pledges arrive.
 */
export function useImpactCounter(
  campaignId: string | undefined,
  metricDefinition: ImpactMetricDefinition | null | undefined,
): UseImpactCounterResult {
  const { snapshot, status, lastUpdated } = useFundingCounter(campaignId);

  const impactValue = computeImpactValue(snapshot?.raisedAmount ?? "0", metricDefinition);

  const [displayValue, setDisplayValue] = useState(impactValue);
  const displayRef = useRef(impactValue);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = displayRef.current;
    const to = impactValue;
    if (from === to) return undefined;

    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      displayRef.current = to;
      setDisplayValue(to);
      return undefined;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / IMPACT_TWEEN_MS);
      const next = tweenImpactValue(from, to, progress);
      displayRef.current = next;
      setDisplayValue(next);
      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };
    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [impactValue]);

  return {
    impactValue,
    displayValue,
    unit: metricDefinition?.unit ?? "",
    metricName: metricDefinition?.name ?? "",
    status,
    lastUpdated,
  };
}
