"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Target, Trophy, Flame } from "lucide-react";

interface AnimatedProgressBarProps {
  totalRaised: number;
  targetAmount: number;
  minTarget: number;
  currencySymbol?: string;
  className?: string;
}

export const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({
  totalRaised,
  targetAmount,
  minTarget,
  currencySymbol = "XLM",
  className = "",
}) => {
  const [animatedWidth, setAnimatedWidth] = useState(0);

  const percentage = Math.min(
    100,
    Math.round((totalRaised / Math.max(1, targetAmount)) * 100)
  );
  const minTargetPercent = Math.min(
    100,
    Math.round((minTarget / Math.max(1, targetAmount)) * 100)
  );

  const isMinTargetReached = totalRaised >= minTarget;
  const isHardCapReached = totalRaised >= targetAmount;

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedWidth(percentage);
    }, 150);
    return () => clearTimeout(timer);
  }, [percentage]);

  const milestones = [
    { label: "25%", value: 25 },
    { label: `Min (${minTargetPercent}%)`, value: minTargetPercent },
    { label: "75%", value: 75 },
    { label: "Goal (100%)", value: 100 },
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
              Campaign Funding Progress
            </h4>
            <p className="text-xs text-zinc-400">
              {isHardCapReached
                ? "Hard cap reached! Fully funded!"
                : isMinTargetReached
                ? "Minimum goal met! Campaign will succeed."
                : "Fundraising in progress..."}
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-center gap-1 justify-end font-mono text-2xl font-black text-emerald-400">
            <Flame className="size-5 text-amber-400 animate-pulse" />
            <span>{percentage}%</span>
          </div>
          <span className="text-xs text-zinc-500">Goal Progress</span>
        </div>
      </div>

      {/* Progress Track */}
      <div className="relative my-6">
        <div className="h-4 w-full rounded-full bg-zinc-800/90 p-0.5 overflow-hidden border border-zinc-700/40 relative">
          {/* Animated Fill Bar */}
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-1000 ease-out shadow-lg shadow-emerald-500/30"
            style={{ width: `${animatedWidth}%` }}
          />
        </div>

        {/* Milestone Tick Markers */}
        <div className="relative w-full h-6 mt-2">
          {milestones.map((m, idx) => (
            <div
              key={idx}
              className="absolute transform -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${m.value}%` }}
            >
              <div
                className={`w-0.5 h-2 rounded-full ${
                  percentage >= m.value ? "bg-emerald-400" : "bg-zinc-700"
                }`}
              />
              <span
                className={`text-[10px] font-medium mt-0.5 ${
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
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-zinc-800 text-center">
        <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
          <span className="text-xs text-zinc-400 block">Total Raised</span>
          <span className="text-sm sm:text-base font-bold text-zinc-100 font-mono">
            {totalRaised.toLocaleString()} {currencySymbol}
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
          <span className="text-xs text-zinc-400 block">Min Threshold</span>
          <span className="text-sm sm:text-base font-bold text-zinc-300 font-mono flex items-center justify-center gap-1">
            {minTarget.toLocaleString()} {currencySymbol}
            {isMinTargetReached && (
              <CheckCircle2 className="size-3.5 text-emerald-400 inline" />
            )}
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
          <span className="text-xs text-zinc-400 block">Hard Cap Target</span>
          <span className="text-sm sm:text-base font-bold text-emerald-400 font-mono flex items-center justify-center gap-1">
            {targetAmount.toLocaleString()} {currencySymbol}
            {isHardCapReached && (
              <Trophy className="size-3.5 text-amber-400 inline" />
            )}
          </span>
        </div>
      </div>
    </div>
  );
};

export default AnimatedProgressBar;
