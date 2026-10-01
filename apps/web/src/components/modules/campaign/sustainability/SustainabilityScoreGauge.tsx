"use client";

import React, { useId } from "react";
import type { SustainabilityTier } from "@/types/campaign";

export interface SustainabilityScoreGaugeProps {
  score: number;
  tier: SustainabilityTier;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export const SustainabilityScoreGauge: React.FC<SustainabilityScoreGaugeProps> = ({
  score,
  tier,
  size = 130,
  strokeWidth = 9,
  className = "",
}) => {
  const gradientId = useId();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  const getGradientColors = (currentTier: SustainabilityTier) => {
    switch (currentTier) {
      case "Optimal":
        return { start: "#34d399", end: "#059669", glow: "rgba(16, 185, 129, 0.35)" };
      case "High Impact":
        return { start: "#2dd4bf", end: "#0d9488", glow: "rgba(20, 184, 166, 0.35)" };
      case "Moderate":
        return { start: "#fbbf24", end: "#d97706", glow: "rgba(245, 158, 11, 0.35)" };
      default:
        return { start: "#a1a1aa", end: "#71717a", glow: "rgba(113, 113, 122, 0.25)" };
    }
  };

  const { start, end, glow } = getGradientColors(tier);

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
      data-testid="sustainability-score-gauge"
    >
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id={`gaugeGrad-${gradientId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={start} />
            <stop offset="100%" stopColor={end} />
          </linearGradient>
        </defs>

        {/* Track background */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#27272a"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />

        {/* Animated Progress Arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#gaugeGrad-${gradientId})`}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{
            filter: `drop-shadow(0 0 6px ${glow})`,
          }}
        />
      </svg>

      {/* Center Score & Meta Label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-extrabold tracking-tighter text-white font-mono">
          {clampedScore}
        </span>
        <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 -mt-1">
          / 100
        </span>
        <span
          className="text-[9px] font-semibold tracking-wider mt-0.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800"
          style={{ color: start }}
        >
          {tier}
        </span>
      </div>
    </div>
  );
};
