"use client";

/**
 * The chronological update feed of a campaign.
 *
 * Updates are rendered oldest → newest so the page reads as a running log of
 * what happened during the campaign. A toggle switches to newest-first for
 * readers who just want the latest news.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowDownWideNarrow, ArrowUpNarrowWide, Bell, Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { CampaignUpdatePreferenceControl } from "./CampaignUpdatePreferenceControl";
import type { CampaignUpdatePost } from "@/types/campaign-update";

export interface CampaignUpdateFeedProps {
  campaignId: string;
  campaignTitle?: string;
  /** Wallet address of the viewer — unlocks `backers_only` updates. */
  viewerAddress?: string;
  /** Render the notification preference control above the feed. */
  showPreferences?: boolean;
  className?: string;
}

type Order = "chronological" | "reverse_chronological";

function formatDate(timestamp?: number): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CampaignUpdateFeed({
  campaignId,
  campaignTitle,
  viewerAddress,
  showPreferences = true,
  className,
}: CampaignUpdateFeedProps) {
  const [updates, setUpdates] = useState<CampaignUpdatePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order>("chronological");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ order, limit: "50" });
      if (viewerAddress) query.set("viewerAddress", viewerAddress);
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/updates?${query}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load updates");
      setUpdates(json.updates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load updates");
    } finally {
      setLoading(false);
    }
  }, [campaignId, order, viewerAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  const isEmpty = useMemo(() => !loading && !error && updates.length === 0, [loading, error, updates]);

  return (
    <section className={`space-y-4 ${className ?? ""}`} aria-label="Campaign updates">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            <Megaphone className="h-4 w-4 text-purple-400" /> Campaign updates
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Progress notes from the creator, in the order they were published.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setOrder((current) =>
                current === "chronological" ? "reverse_chronological" : "chronological",
              )
            }
            aria-label={
              order === "chronological" ? "Show newest updates first" : "Show oldest updates first"
            }
          >
            {order === "chronological" ? (
              <ArrowUpNarrowWide className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownWideNarrow className="h-3.5 w-3.5" />
            )}
            {order === "chronological" ? "Oldest first" : "Newest first"}
          </Button>
        </div>
      </div>

      {showPreferences && viewerAddress && (
        <CampaignUpdatePreferenceControl campaignId={campaignId} viewerAddress={viewerAddress} />
      )}

      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading updates…
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {isEmpty && (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <Bell className="mx-auto h-8 w-8 text-zinc-700" />
          <p className="mt-2 text-sm font-medium text-zinc-400">No updates yet</p>
          <p className="mt-1 text-xs text-zinc-600">
            {campaignTitle
              ? `${campaignTitle} has not posted an update yet.`
              : "This campaign has not posted an update yet."}
          </p>
        </div>
      )}

      <ol className="space-y-4">
        {updates.map((update) => (
          <li
            key={update.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition-colors hover:border-zinc-700"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-semibold text-zinc-50">{update.title}</h4>
              {update.visibility === "backers_only" && (
                <Badge className="bg-amber-500/15 text-amber-300 text-xs">Backers only</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {formatDate(update.publishedAt ?? update.createdAt)}
            </p>

            <MarkdownRenderer content={update.bodyMarkdown} className="mt-3" />

            {update.imageUrls.length > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {update.imageUrls
                  .filter((url) => /^https?:\/\//i.test(url))
                  .map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt={update.title}
                      className="w-full rounded-lg border border-zinc-800 object-cover"
                    />
                  ))}
              </div>
            )}

            {update.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {update.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default CampaignUpdateFeed;
