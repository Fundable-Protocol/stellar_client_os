"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Link2, Film, Sparkles, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface LinkedCampaign {
  campaign: {
    id: string;
    name: string;
    status: string;
    goalAmount: string;
    raisedAmount: string;
  };
  link: {
    relation: "SEQUEL" | "PREQUEL" | "SPINOFF" | "RELATED";
    order?: number;
    notes?: string;
  };
}

interface SeriesInfo {
  id: string;
  name: string;
  description?: string;
  campaignIds: string[];
}

export interface CampaignSeriesProps {
  campaignId: string;
  campaignTitle?: string;
  currentUserAddress?: string;
  isCreator?: boolean;
}

const RELATION_LABELS: Record<LinkedCampaign["link"]["relation"], string> = {
  SEQUEL: "Sequel",
  PREQUEL: "Prequel",
  SPINOFF: "Spinoff",
  RELATED: "Related",
};

const RELATION_STYLES: Record<LinkedCampaign["link"]["relation"], string> = {
  SEQUEL: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  PREQUEL: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  SPINOFF: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  RELATED: "bg-zinc-700/40 text-zinc-300 border-zinc-700",
};

export function CampaignSeries({
  campaignId,
  campaignTitle = "This campaign",
  currentUserAddress = "GD6W...X892",
  isCreator = true,
}: CampaignSeriesProps) {
  const [linked, setLinked] = useState<LinkedCampaign[]>([]);
  const [series, setSeries] = useState<SeriesInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Link-management form state (creator only).
  const [targetId, setTargetId] = useState("");
  const [relation, setRelation] = useState<LinkedCampaign["link"]["relation"]>("SEQUEL");
  const [targetName, setTargetName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/sequels?includeIncoming=true`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load linked campaigns");
      const payload = await response.json();
      setLinked(payload.data ?? []);
      setSeries(payload.series ?? null);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load linked campaigns");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nextInSeries = linked.find(
    (entry) => entry.link.relation === "SEQUEL",
  ) ?? linked[0];

  const handleLink = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/campaigns/sequels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCampaignId: campaignId,
          targetCampaignId: targetId.trim(),
          relation,
          linkedBy: currentUserAddress,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to link campaigns");
      setMessage(`Linked "${targetName.trim() || targetId.trim()}" as ${RELATION_LABELS[relation]}.`);
      setTargetId("");
      setTargetName("");
      await load();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to link campaigns");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async (targetCampaignId: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/campaigns/sequels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCampaignId: campaignId, targetCampaignId }),
      });
      if (!response.ok) throw new Error("Failed to unlink campaign");
      setMessage("Unlinked campaign.");
      await load();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to unlink campaign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-zinc-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
            <Link2 className="h-5 w-5 text-purple-400" />
            Series & Sequel Universe
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Link sequel campaigns, track the {campaignTitle} universe, and surface the next chapter to backers.
          </p>
        </div>

        {series && (
          <Badge variant="outline" className="border-purple-500/50 bg-purple-950/30 px-3 py-1.5 text-[11px] text-purple-300">
            <Film className="mr-1.5 h-3.5 w-3.5" />
            {series.name}
            {Array.isArray(series.campaignIds) && series.campaignIds.length > 0 && (
              <span className="ml-1 text-zinc-400">· {series.campaignIds.length} entries</span>
            )}
          </Badge>
        )}
      </div>

      {/* Next in series recommendation */}
      {loading ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
          Loading series…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-900/40 bg-rose-950/20 p-4 text-xs text-rose-300">{error}</div>
      ) : nextInSeries ? (
        <div className="rounded-xl border border-purple-900/40 bg-gradient-to-br from-purple-950/40 to-zinc-900/60 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-purple-300">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              Next in series
            </span>
            <Badge variant="outline" className={`${RELATION_STYLES[nextInSeries.link.relation]} text-[10px]`}>
              {RELATION_LABELS[nextInSeries.link.relation]}
              {nextInSeries.link.order ? ` · Part ${nextInSeries.link.order}` : ""}
            </Badge>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-bold text-zinc-50">{nextInSeries.campaign.name}</p>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                {nextInSeries.campaign.status} · {nextInSeries.campaign.raisedAmount} / {nextInSeries.campaign.goalAmount} XLM
              </p>
            </div>
            <Link href={`/campaigns/${nextInSeries.campaign.id}`}>
              <Button size="sm" className="bg-gradient-to-r from-purple-600 to-blue-600 text-xs font-semibold text-white hover:from-purple-700 hover:to-blue-700">
                Continue the Journey <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
          {nextInSeries.link.notes && (
            <p className="mt-3 rounded-lg bg-zinc-950/50 p-2.5 text-[11px] italic text-zinc-300">{nextInSeries.link.notes}</p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
          No sequel linked yet. Creators can add the next chapter below.
        </div>
      )}

      {/* Creator link manager */}
      {isCreator && (
        <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Plus className="h-4 w-4 text-purple-400" /> Link a follow-up campaign
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="Target campaign id"
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500"
            />
            <input
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="Target campaign name (display only)"
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500"
            />
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value as LinkedCampaign["link"]["relation"])}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none"
            >
              <option value="SEQUEL">Sequel (next in series)</option>
              <option value="PREQUEL">Prequel</option>
              <option value="SPINOFF">Spinoff</option>
              <option value="RELATED">Related project</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={handleLink}
              disabled={busy || !targetId.trim()}
              className="bg-purple-600 text-xs font-semibold text-white hover:bg-purple-700"
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" /> Link {relation === "SEQUEL" ? "Sequel" : RELATION_LABELS[relation]}
            </Button>
            {message && <span className="text-[11px] text-zinc-400">{message}</span>}
          </div>
        </div>
      )}

      {/* All linked campaigns */}
      {linked.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Universe ({linked.length})
          </h3>
          {linked.map((entry) => (
            <div
              key={entry.campaign.id}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs"
            >
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={`${RELATION_STYLES[entry.link.relation]} text-[10px]`}>
                  {RELATION_LABELS[entry.link.relation]}
                  {entry.link.order ? ` #${entry.link.order}` : ""}
                </Badge>
                <Link href={`/campaigns/${entry.campaign.id}`} className="font-semibold text-zinc-100 hover:text-purple-300">
                  {entry.campaign.name}
                </Link>
              </div>
              {isCreator && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleUnlink(entry.campaign.id)}
                  className="text-zinc-500 hover:text-rose-400"
                  title="Unlink campaign"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default CampaignSeries;