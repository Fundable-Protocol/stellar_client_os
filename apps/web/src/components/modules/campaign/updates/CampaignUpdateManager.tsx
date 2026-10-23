"use client";

/**
 * Creator dashboard for campaign updates.
 *
 * Lists every update of a campaign (drafts and published), lets the creator
 * write a new one, publish a draft — which notifies the backers — and remove
 * an update.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Megaphone,
  PenLine,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CampaignUpdateEditor } from "./CampaignUpdateEditor";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { CampaignUpdatePost } from "@/types/campaign-update";

export interface CampaignUpdateManagerProps {
  campaignId: string;
  campaignTitle?: string;
  /** Wallet address of the creator — sent to the API for authorization. */
  creatorAddress: string;
  className?: string;
}

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

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-amber-500/15 text-amber-300",
  published: "bg-emerald-500/15 text-emerald-300",
  archived: "bg-zinc-700/40 text-zinc-400",
};

export function CampaignUpdateManager({
  campaignId,
  campaignTitle,
  creatorAddress,
  className,
}: CampaignUpdateManagerProps) {
  const [updates, setUpdates] = useState<CampaignUpdatePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<CampaignUpdatePost | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        status: "draft,published,archived",
        order: "reverse_chronological",
        limit: "50",
        viewerAddress: creatorAddress,
      });
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/updates?${query}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load updates");
      setUpdates(json.updates ?? []);
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to load updates",
      });
    } finally {
      setLoading(false);
    }
  }, [campaignId, creatorAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = useCallback(
    async (update: CampaignUpdatePost) => {
      setBusyId(update.id);
      setStatus(null);
      try {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/updates/${encodeURIComponent(update.id)}/publish`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ creatorAddress, campaignTitle }),
          },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to publish the update");

        const report = json.report ?? {};
        setStatus({
          type: "success",
          message: `Published. ${report.instantNotified ?? 0} backers emailed instantly, ${
            report.queuedForDigest ?? 0
          } queued for a digest, ${report.inAppNotified ?? 0} notified in-app.`,
        });
        await load();
      } catch (err) {
        setStatus({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to publish the update",
        });
      } finally {
        setBusyId(null);
      }
    },
    [campaignId, campaignTitle, creatorAddress, load],
  );

  const remove = useCallback(
    async (update: CampaignUpdatePost) => {
      if (!window.confirm(`Delete "${update.title}"? This cannot be undone.`)) return;
      setBusyId(update.id);
      setStatus(null);
      try {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/updates/${encodeURIComponent(update.id)}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ creatorAddress }),
          },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to delete the update");
        setStatus({ type: "success", message: "Update deleted." });
        await load();
      } catch (err) {
        setStatus({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to delete the update",
        });
      } finally {
        setBusyId(null);
      }
    },
    [campaignId, creatorAddress, load],
  );

  if (composing || editing) {
    return (
      <div className={`space-y-4 ${className ?? ""}`}>
        <button
          type="button"
          onClick={() => {
            setComposing(false);
            setEditing(null);
          }}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Back to updates
        </button>
        <CampaignUpdateEditor
          campaignId={campaignId}
          campaignTitle={campaignTitle}
          creatorAddress={creatorAddress}
          initialUpdate={editing}
          onSaved={async () => {
            setComposing(false);
            setEditing(null);
            await load();
          }}
          onCancel={() => {
            setComposing(false);
            setEditing(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className={`space-y-5 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            <Megaphone className="h-4 w-4 text-purple-400" /> Campaign updates
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Publish progress notes and notify your backers by email and in-app.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setComposing(true)}
          className="bg-purple-600 text-white hover:bg-purple-500"
        >
          <Plus className="h-4 w-4" /> New update
        </Button>
      </div>

      {status && (
        <p
          role="status"
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
            status.type === "success"
              ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-300"
              : "border-red-900/60 bg-red-950/30 text-red-300"
          }`}
        >
          {status.type === "success" ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          {status.message}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading updates…
        </div>
      ) : updates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-zinc-700" />
          <p className="mt-2 text-sm font-medium text-zinc-400">No updates yet</p>
          <p className="mt-1 text-xs text-zinc-600">
            Write your first update to keep your backers in the loop.
          </p>
          <Button
            type="button"
            onClick={() => setComposing(true)}
            className="mt-4 bg-purple-600 text-white hover:bg-purple-500"
          >
            <Plus className="h-4 w-4" /> Write an update
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {updates.map((update) => (
            <li
              key={update.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-zinc-100">{update.title}</h4>
                    <Badge className={`text-[11px] ${STATUS_STYLES[update.status] ?? ""}`}>
                      {update.status === "published" ? (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      ) : (
                        <Clock className="mr-1 h-3 w-3" />
                      )}
                      {update.status}
                    </Badge>
                    {update.visibility === "backers_only" && (
                      <Badge className="bg-amber-500/15 text-[11px] text-amber-300">
                        Backers only
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {update.status === "published"
                      ? `Published ${formatDate(update.publishedAt)}`
                      : `Last edited ${formatDate(update.updatedAt)}`}
                    {" · "}
                    {update.notifyBackers
                      ? `Notifies backers (${update.notificationMode.replace("_", " ")})`
                      : "Does not notify backers"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {update.status !== "published" && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void publish(update)}
                      disabled={busyId === update.id}
                      className="bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      {busyId === update.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Publish
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(update)}
                    disabled={busyId === update.id}
                    className="border-zinc-700 text-zinc-300"
                    aria-label={`Edit ${update.title}`}
                  >
                    <PenLine className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void remove(update)}
                    disabled={busyId === update.id}
                    className="border-zinc-700 text-red-400 hover:border-red-800"
                    aria-label={`Delete ${update.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 border-t border-zinc-800 pt-3">
                <MarkdownRenderer content={update.bodyMarkdown} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CampaignUpdateManager;
