"use client";

import React from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Eye, ExternalLink, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  SCHEDULABLE_PLATFORMS,
  type PlatformPostPreview,
} from "@/services/campaign-social-scheduler.service";

export interface SocialPostPreviewProps {
  previews: PlatformPostPreview[];
  scheduledDateLabel?: string;
  timezone?: string;
}

export const SocialPostPreview: React.FC<SocialPostPreviewProps> = ({
  previews,
  scheduledDateLabel,
  timezone = "UTC",
}) => {
  return (
    <section
      data-testid="social-post-preview"
      aria-labelledby="social-post-preview-heading"
      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800 pb-4">
        <div>
          <h3
            id="social-post-preview-heading"
            className="text-lg font-bold text-zinc-100 flex items-center gap-2"
          >
            <Eye className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            Post Preview Before Scheduling
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            Review how your promotional post, hashtags, and campaign card will appear on each platform before scheduling.
          </p>
        </div>

        {scheduledDateLabel && (
          <Badge
            variant="outline"
            data-testid="preview-scheduled-badge"
            className="border-emerald-500/40 bg-emerald-950/30 text-emerald-300 text-xs flex items-center gap-1.5 self-start sm:self-auto"
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {scheduledDateLabel} ({timezone})
            </span>
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {previews.map((preview) => {
          const meta = SCHEDULABLE_PLATFORMS[preview.platform];
          const usagePercent = Math.min(
            100,
            Math.round((preview.characterCount / preview.maxChars) * 100),
          );

          return (
            <article
              key={preview.platform}
              data-testid={`post-preview-card-${preview.platform}`}
              aria-label={`${preview.platformLabel} post preview`}
              className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 flex flex-col justify-between gap-4 shadow-lg"
            >
              <div className="space-y-3">
                {/* Platform Header */}
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white"
                      style={{ backgroundColor: meta.accentColor }}
                    >
                      {meta.shortLabel}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-zinc-100 truncate">
                        {preview.displayName}
                      </p>
                      <p
                        data-testid={`preview-handle-${preview.platform}`}
                        className="text-[11px] font-mono text-zinc-400 truncate"
                      >
                        {preview.handle}
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className={
                      preview.connected
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[10px]"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px]"
                    }
                  >
                    {preview.connected ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Ready
                      </span>
                    ) : (
                      "Connect Account"
                    )}
                  </Badge>
                </div>

                {/* Post Copy */}
                <div
                  data-testid={`preview-body-${preview.platform}`}
                  className="rounded-lg bg-zinc-900/70 p-3 text-xs text-zinc-200 whitespace-pre-wrap break-words leading-relaxed min-h-[96px]"
                >
                  {preview.formattedBody || (
                    <span className="italic text-zinc-500">
                      Write your promotional message to preview it on {preview.platformLabel}...
                    </span>
                  )}
                </div>

                {/* Embedded Campaign Link Card */}
                <div className="rounded-lg border border-zinc-800 bg-gradient-to-br from-purple-950/30 via-zinc-900 to-emerald-950/20 p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-emerald-400 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="h-3 w-3" aria-hidden="true" /> Fundable Verified Campaign
                    </span>
                    <ExternalLink className="h-3 w-3 text-zinc-500" aria-hidden="true" />
                  </div>
                  <p className="text-xs font-bold text-zinc-100 line-clamp-1">
                    {preview.campaignTitle}
                  </p>
                  <p className="text-[11px] font-mono text-zinc-400 truncate">
                    {preview.campaignUrl}
                  </p>
                </div>
              </div>

              {/* Character Limit Footer */}
              <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">{preview.platformLabel} Length</span>
                  <span
                    data-testid={`preview-char-count-${preview.platform}`}
                    className={
                      preview.isOverLimit
                        ? "font-bold text-rose-400 flex items-center gap-1"
                        : "font-mono text-zinc-300"
                    }
                  >
                    {preview.isOverLimit && (
                      <AlertTriangle className="h-3 w-3 text-rose-400" aria-hidden="true" />
                    )}
                    {preview.characterCount} / {preview.maxChars} chars
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      preview.isOverLimit
                        ? "bg-rose-500"
                        : usagePercent > 85
                        ? "bg-amber-400"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default SocialPostPreview;
