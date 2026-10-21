import React from "react";
import { cn } from "@/lib/utils";
import type { LiveStreamStatus } from "@/lib/live-stream";

interface LiveStreamBadgeProps {
  /** Provider-backed status; the badge renders only for an explicit "live". */
  status?: LiveStreamStatus | null;
  className?: string;
}

/**
 * Campaign-card indicator shown only while the provider reports the stream as
 * actually live. Missing, offline, or unknown statuses render nothing so the
 * badge can never overstate reality (issue #1225).
 */
export function LiveStreamBadge({ status, className }: LiveStreamBadgeProps) {
  if (status !== "live") return null;

  return (
    <span
      data-testid="live-stream-badge"
      title="Streaming live now"
      aria-label="Live now"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-red-500/50 bg-red-500/15 px-2.5 py-0.5",
        "text-[10px] font-bold uppercase tracking-wider text-red-400 shadow-sm shadow-red-500/10",
        className,
      )}
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      <span aria-hidden="true">Live</span>
    </span>
  );
}
