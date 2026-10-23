"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Target, Trophy, Flame } from "lucide-react";
import { useTranslation } from "@/i18n/I18nProvider";

interface AnimatedProgressBarProps {
  totalRaised: number;
  targetAmount: number;
  minTarget: number;
  stretchTarget?: number;
  currencySymbol?: string;
  className?: string;
}

/**
 * Funding progress bar for campaign pages.
 *
 * The fill and milestone markers are positioned with logical inline offsets
 * (`inset-inline-start`), so in an RTL locale the bar fills from the right edge
 * and markers are ordered right-to-left without a separate code path.
 */
export const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({
  totalRaised,
  targetAmount,
  minTarget,
  stretchTarget,
  currencySymbol = "XLM",
  className = "",
}) => {
  const { t, dir, formatNumber } = useTranslation();
  const [animatedWidth, setAnimatedWidth] = useState(0);

  // Calculate percentages based on stretch target if available, otherwise use target
  const maxAmount = stretchTarget && stretchTarget > targetAmount ? stretchTarget : targetAmount;

  const percentage = Math.min(
    100,
    Math.round((totalRaised / Math.max(1, maxAmount)) * 100)
  );
  const minTargetPercent = Math.min(
    100,
    Math.round((minTarget / Math.max(1, maxAmount)) * 100)
  );
  const goalPercent = Math.min(
    100,
    Math.round((targetAmount / Math.max(1, maxAmount)) * 100)
  );

  const isMinTargetReached = totalRaised >= minTarget;
  const isGoalReached = totalRaised >= targetAmount;
  const isStretchReached = stretchTarget ? totalRaised >= stretchTarget : false;
  const hasStretchTiers = Boolean(stretchTarget && stretchTarget > targetAmount);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedWidth(percentage);
    }, 150);
    return () => clearTimeout(timer);
  }, [percentage]);

  const statusMessage = isStretchReached
    ? t("campaign.progress.stretchUnlocked")
    : isGoalReached
    ? t("campaign.progress.goalReached")
    : isMinTargetReached
    ? t("campaign.progress.minTargetReached")
    : t("campaign.progress.inProgress");

  // Build milestones based on whether we have stretch goals
  const milestones = hasStretchTiers
    ? [
        { label: t("campaign.progress.minMilestone", { percent: minTargetPercent }), value: minTargetPercent },
        { label: t("campaign.progress.goalMilestone", { percent: goalPercent }), value: goalPercent },
        { label: t("campaign.progress.stretchMilestone"), value: 100 },
      ]
    : [
        { label: "25%", value: 25 },
        { label: t("campaign.progress.minMilestone", { percent: minTargetPercent }), value: minTargetPercent },
        { label: "75%", value: 75 },
        { label: t("campaign.progress.goalMilestoneFull"), value: 100 },
      ];

  return (
    <div
      className={`rounded-2xl bg-slate-900/90 border border-zinc-800 p-6 shadow-lg backdrop-blur-md ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Target className="size-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
              {t("campaign.progress.title")}
            </h4>
            <p className="text-xs text-zinc-400">{statusMessage}</p>
          </div>
        </div>

        <div className="text-end">
          <div className="flex items-center gap-1 justify-end font-mono text-2xl font-black text-emerald-400">
            <Flame className="size-5 text-amber-400 animate-pulse" />
            <span>{formatNumber(percentage)}%</span>
          </div>
          <span className="text-xs text-zinc-500">{t("campaign.progress.goalProgress")}</span>
        </div>
      </div>

      {/* Progress Track */}
      <div className="relative my-6">
        <div
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("campaign.progress.ariaLabel")}
          aria-valuetext={t("campaign.progress.valuetext", {
            percentage: formatNumber(percentage),
            raised: formatNumber(totalRaised),
            goal: formatNumber(targetAmount),
            currency: currencySymbol,
          })}
          className="h-4 w-full rounded-full bg-zinc-800/90 p-0.5 overflow-hidden border border-zinc-700/40 relative"
        >
          {/* Segmented Progress Bar for Tiers */}
          {hasStretchTiers ? (
            <>
              {/* Minimum Tier Segment */}
              <div
                data-testid="campaign-progress-min-segment"
                className="absolute inset-y-0 rounded-s-full bg-yellow-400 transition-all duration-1000 ease-out"
                style={{
                  insetInlineStart: 0,
                  width: `${Math.min(animatedWidth, minTargetPercent)}%`,
                }}
              />
              {/* Goal Tier Segment */}
              <div
                data-testid="campaign-progress-goal-segment"
                className="absolute inset-y-0 bg-emerald-500 transition-all duration-1000 ease-out"
                style={{
                  insetInlineStart: `${minTargetPercent}%`,
                  width: `${Math.max(0, Math.min(animatedWidth, goalPercent) - minTargetPercent)}%`,
                }}
              />
              {/* Stretch Tier Segment */}
              <div
                data-testid="campaign-progress-stretch-segment"
                className="absolute inset-y-0 rounded-e-full bg-gradient-to-r rtl:bg-gradient-to-l from-purple-500 to-pink-500 transition-all duration-1000 ease-out shadow-lg shadow-purple-500/30"
                style={{
                  insetInlineStart: `${goalPercent}%`,
                  width: `${Math.max(0, animatedWidth - goalPercent)}%`,
                }}
              />
            </>
          ) : (
            /* Standard Fill Bar */
            <div
              data-testid="campaign-progress-fill"
              className="absolute inset-y-0 rounded-full bg-gradient-to-r rtl:bg-gradient-to-l from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-1000 ease-out shadow-lg shadow-emerald-500/30"
              style={{ insetInlineStart: 0, width: `${animatedWidth}%` }}
            />
          )}
        </div>

        {/* Milestone Tick Markers */}
        <div className="relative w-full h-6 mt-2">
          {milestones.map((m, idx) => (
            <div
              key={idx}
              data-testid="campaign-progress-milestone"
              className={`absolute top-0 flex flex-col items-center ${
                dir === "rtl" ? "translate-x-1/2" : "-translate-x-1/2"
              }`}
              style={{ insetInlineStart: `${m.value}%` }}
            >
              <div
                className={`w-0.5 h-2 rounded-full ${
                  percentage >= m.value ? "bg-emerald-400" : "bg-zinc-700"
                }`}
              />
              <span
                className={`text-[10px] font-medium mt-0.5 whitespace-nowrap ${
                  percentage >= m.value ? "text-emerald-400 font-bold" : "text-zinc-500"
                }`}
              >
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Raised & Target Metrics Breakdown */}
      <div className={`grid ${hasStretchTiers ? 'grid-cols-4' : 'grid-cols-3'} gap-3 pt-3 border-t border-zinc-800 text-center`}>
        <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
          <span className="text-xs text-zinc-400 block">{t("campaign.progress.totalRaised")}</span>
          <span className="text-sm sm:text-base font-bold text-zinc-100 font-mono">
            {formatNumber(totalRaised)} {currencySymbol}
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-yellow-400/30">
          <span className="text-xs text-zinc-400 block">{t("campaign.progress.minimum")}</span>
          <span className="text-sm sm:text-base font-bold text-yellow-400 font-mono flex items-center justify-center gap-1">
            {formatNumber(minTarget)} {currencySymbol}
            {isMinTargetReached && (
              <CheckCircle2 className="size-3.5 text-yellow-400 inline" />
            )}
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-emerald-500/30">
          <span className="text-xs text-zinc-400 block">{t("campaign.progress.goal")}</span>
          <span className="text-sm sm:text-base font-bold text-emerald-400 font-mono flex items-center justify-center gap-1">
            {formatNumber(targetAmount)} {currencySymbol}
            {isGoalReached && (
              <Trophy className="size-3.5 text-emerald-400 inline" />
            )}
          </span>
        </div>

        {hasStretchTiers && stretchTarget && (
          <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-purple-500/30">
            <span className="text-xs text-zinc-400 block">{t("campaign.progress.stretch")}</span>
            <span className="text-sm sm:text-base font-bold text-purple-400 font-mono flex items-center justify-center gap-1">
              {formatNumber(stretchTarget)} {currencySymbol}
              {isStretchReached && (
                <Trophy className="size-3.5 text-purple-400 inline" />
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnimatedProgressBar;
