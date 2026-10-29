"use client";

import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { useFundingCounter, type FundingFeedStatus } from "@/hooks/use-funding-counter";
import { useTranslation } from "@/i18n/I18nProvider";
import { easeOutCubic, formatFunding, fundingPercent, tweenFundingValue } from "@/lib/funding-counter";

const ROLL_DURATION_MS = 900;

interface FundingCounterProps {
  campaignId?: string;
  /** Display value used until the first live update arrives. */
  initialRaised?: string;
  initialGoal?: string;
  token?: string;
  className?: string;
}

const statusLabel: Record<FundingFeedStatus, { text: string; tone: string } | null> = {
  idle: null,
  "not-found": null,
  live: { text: "Live", tone: "text-emerald-400" },
  polling: { text: "Live (30s fallback)", tone: "text-amber-400" },
};

/**
 * Smoothly-rolling real-time funding counter (issue #1259).
 *
 * Receives updates over the campaign's SSE stream (30s poll fallback handled
 * inside the hook) and animates the displayed amount from the previous total
 * to the new one with an ease-out tween each time a pledge lands.
 */
export function FundingCounter({
  campaignId,
  initialRaised = "0",
  initialGoal = "0",
  token,
  className,
}: FundingCounterProps) {
  const { t } = useTranslation();
  const { snapshot, status } = useFundingCounter(campaignId);

  const targetRaised = snapshot
    ? Number(snapshot.raisedAmount.replaceAll(",", "")) || 0
    : Number(initialRaised.replaceAll(",", "")) || 0;
  const targetGoal = snapshot
    ? Number(snapshot.goalAmount.replaceAll(",", "")) || 0
    : Number(initialGoal.replaceAll(",", "")) || 0;

  // ── Rolling number animation ────────────────────────────────────────────
  const [displayValue, setDisplayValue] = useState(targetRaised);
  const lastTarget = useRef(targetRaised);
  const animation = useRef<{ from: number; raf: number } | null>(null);

  useEffect(() => {
    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const from = lastTarget.current;
    lastTarget.current = targetRaised;

    if (reducedMotion || from === targetRaised) {
      if (animation.current) {
        cancelAnimationFrame(animation.current.raf);
        animation.current = null;
      }
      setDisplayValue(targetRaised); // tween landing point or motion-free jump
      return;
    }

    if (animation.current) cancelAnimationFrame(animation.current.raf);
    const tween = { from, raf: 0 };
    const start = performance.now();
    tween.raf = requestAnimationFrame(function roll(now: number) {
      const progress = Math.min((now - start) / ROLL_DURATION_MS, 1);
      setDisplayValue(tweenFundingValue(from, targetRaised, easeOutCubic(progress)));
      if (progress < 1) tween.raf = requestAnimationFrame(roll);
    });
    animation.current = tween;

    return () => {
      cancelAnimationFrame(tween.raf);
    };
  }, [targetRaised]);

  const percent = fundingPercent(displayValue, targetGoal);
  const badge = statusLabel[status];

  return (
    <div className={className} data-testid="funding-counter" data-status={status}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-zinc-400">
          Total Raised
          {badge ? (
            <span className={`ms-2 inline-flex items-center gap-1 font-bold ${badge.tone}`}>
              <Activity className="h-3 w-3 animate-pulse" aria-hidden />
              {badge.text}
            </span>
          ) : null}
        </span>
        <span className="text-xs font-bold text-emerald-400">{percent}% Funded</span>
      </div>

      <div className="flex items-baseline gap-2" aria-live="polite" aria-atomic="true">
        <span className="text-3xl font-black tabular-nums text-zinc-50" data-testid="funding-counter-value">
          {formatFunding(displayValue)}
        </span>
        <span className="text-sm font-semibold text-purple-400">{token ?? "XLM"}</span>
        <span className="text-xs text-zinc-500">/ {formatFunding(targetGoal)}</span>
      </div>

      {/* Progress bar follows the animated value so it rolls together with the number. */}
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800"
        role="progressbar"
        aria-label={t("campaign.progress.ariaLabel")}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="absolute inset-y-0 rounded-full bg-gradient-to-r rtl:bg-gradient-to-l from-purple-500 via-indigo-500 to-emerald-400"
          style={{ insetInlineStart: 0, width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
