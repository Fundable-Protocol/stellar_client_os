"use client";

import React, { useContext, useId, useState } from "react";
import { Radio, Save, Trash2 } from "lucide-react";
import { WalletContext } from "@/providers/StellarWalletProvider";
import { campaignLiveStreamSchema } from "@/lib/validations";
import { formatLiveStreamPlatform, type CampaignLiveStream } from "@/lib/live-stream";
import type { CampaignStreamUpdateRequest } from "@/types/live-stream";
import { cn } from "@/lib/utils";

export interface CampaignLiveStreamManagerProps {
  campaignId: string;
  /** Current persisted stream, rendered as the form's starting value. */
  liveStream: CampaignLiveStream | null;
  /** Invoked after a successful mutation so the section can refetch. */
  onChanged: () => void;
}

type FieldErrors = Partial<Record<"streamUrl" | "replayUrl" | "title", string>>;

const inputClasses =
  "w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-purple-500 aria-invalid:border-red-500/60";

function mapSubmitError(status: number, serverError?: string): string {
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (serverError) return serverError;
  if (status >= 500) return "Unable to save the stream. Please try again.";
  return "Unable to save the stream. Please check the URL and try again.";
}

/**
 * Creator-only editor for the campaign's live stream metadata.
 *
 * Renders nothing unless the connected wallet matches the campaign creator,
 * so stream-management actions are never exposed to unauthorized viewers.
 * Writes go through PUT/DELETE /api/campaigns/[id]/stream, which re-validates
 * URLs and re-checks ownership server-side.
 */
export function CampaignLiveStreamManager({ campaignId, liveStream, onChanged }: CampaignLiveStreamManagerProps) {
  const wallet = useContext(WalletContext);
  const address = wallet?.address ?? null;
  const ids = useId();

  const [streamUrl, setStreamUrl] = useState(liveStream?.streamUrl ?? "");
  const [replayUrl, setReplayUrl] = useState(liveStream?.replayUrl ?? "");
  const [title, setTitle] = useState(liveStream?.title ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!address) return null;

  const clearMessages = () => {
    setFieldErrors({});
    setSubmitError(null);
    setNotice(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    clearMessages();

    const parsed = campaignLiveStreamSchema.safeParse({
      streamUrl,
      replayUrl: replayUrl || undefined,
      title: title || undefined,
    });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "streamUrl" || key === "replayUrl" || key === "title") {
          if (!errors[key]) errors[key] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const payload: CampaignStreamUpdateRequest = {
        streamUrl: parsed.data.streamUrl,
        requestedBy: address,
        ...(parsed.data.replayUrl ? { replayUrl: parsed.data.replayUrl } : {}),
        ...(parsed.data.title ? { title: parsed.data.title } : {}),
      };
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/stream`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setSubmitError(mapSubmitError(response.status, body?.error));
        return;
      }
      setNotice(liveStream ? "Live stream updated." : "Live stream saved.");
      onChanged();
    } catch {
      setSubmitError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (submitting) return;
    clearMessages();
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/stream?requestedBy=${encodeURIComponent(address)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setSubmitError(mapSubmitError(response.status, body?.error));
        return;
      }
      setStreamUrl("");
      setReplayUrl("");
      setTitle("");
      setNotice("Live stream removed.");
      onChanged();
    } catch {
      setSubmitError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6"
      data-testid="campaign-live-stream-manager"
    >
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-purple-400" aria-hidden="true" />
        <h2 className="text-xl font-bold text-zinc-50">
          {liveStream ? "Live stream settings" : "Add a live stream"}
        </h2>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        Attach a YouTube Live or Twitch broadcast. The replay link stays on the campaign page after the
        event ends.
      </p>

      {liveStream && (
        <p className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
          Current stream:{" "}
          <a
            href={liveStream.streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-purple-300 underline-offset-2 hover:underline"
          >
            {formatLiveStreamPlatform(liveStream.platform)}
          </a>
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate aria-busy={submitting}>
        <div className="space-y-1.5">
          <label htmlFor={`${ids}-stream-url`} className="text-xs font-medium text-zinc-300">
            Stream URL <span className="text-red-400" aria-hidden="true">*</span>
          </label>
          <input
            id={`${ids}-stream-url`}
            type="url"
            inputMode="url"
            autoComplete="url"
            value={streamUrl}
            onChange={(event) => setStreamUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            aria-invalid={fieldErrors.streamUrl ? true : undefined}
            aria-describedby={
              fieldErrors.streamUrl ? `${ids}-stream-url-error` : `${ids}-stream-url-hint`
            }
            className={inputClasses}
          />
          <p id={`${ids}-stream-url-hint`} className="text-xs text-zinc-500">
            Supported: YouTube live/video URLs and Twitch channel or VOD URLs.
          </p>
          {fieldErrors.streamUrl && (
            <p id={`${ids}-stream-url-error`} role="alert" className="text-xs font-medium text-red-400">
              {fieldErrors.streamUrl}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${ids}-replay-url`} className="text-xs font-medium text-zinc-300">
            Replay URL <span className="text-zinc-500">(optional)</span>
          </label>
          <input
            id={`${ids}-replay-url`}
            type="url"
            inputMode="url"
            autoComplete="url"
            value={replayUrl}
            onChange={(event) => setReplayUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=... or https://www.twitch.tv/videos/..."
            aria-invalid={fieldErrors.replayUrl ? true : undefined}
            aria-describedby={
              fieldErrors.replayUrl ? `${ids}-replay-url-error` : `${ids}-replay-url-hint`
            }
            className={inputClasses}
          />
          <p id={`${ids}-replay-url-hint`} className="text-xs text-zinc-500">
            Kept for viewers after the live broadcast ends.
          </p>
          {fieldErrors.replayUrl && (
            <p id={`${ids}-replay-url-error`} role="alert" className="text-xs font-medium text-red-400">
              {fieldErrors.replayUrl}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${ids}-title`} className="text-xs font-medium text-zinc-300">
            Stream title <span className="text-zinc-500">(optional)</span>
          </label>
          <input
            id={`${ids}-title`}
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Field update from the planting site"
            maxLength={120}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? `${ids}-title-error` : undefined}
            className={inputClasses}
          />
          {fieldErrors.title && (
            <p id={`${ids}-title-error`} role="alert" className="text-xs font-medium text-red-400">
              {fieldErrors.title}
            </p>
          )}
        </div>

        {submitError && (
          <p role="alert" className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            {submitError}
          </p>
        )}
        {notice && (
          <p role="status" aria-live="polite" className="rounded-md border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
            {notice}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white",
              "hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {submitting ? "Saving…" : liveStream ? "Update stream" : "Save stream"}
          </button>
          {liveStream && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={submitting}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-red-900/70 bg-red-950/30 px-3 py-2",
                "text-sm font-medium text-red-300 hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove stream
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
