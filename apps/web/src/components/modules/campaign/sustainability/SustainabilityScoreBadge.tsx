"use client";

import React from "react";
import { Leaf, Sparkles, ShieldCheck, Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SustainabilityTier } from "@/types/campaign";

export interface SustainabilityScoreBadgeProps {
  score: number;
  tier: SustainabilityTier;
  size?: "sm" | "md";
  className?: string;
  onClick?: () => void;
}

export const SustainabilityScoreBadge: React.FC<SustainabilityScoreBadgeProps> = ({
  score,
  tier,
  size = "sm",
  className = "",
  onClick,
}) => {
  const getTierStyles = (currentTier: SustainabilityTier) => {
    switch (currentTier) {
      case "Optimal":
        return {
          badgeClass: "bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-emerald-950/50",
          pillClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
          icon: <Sparkles className="h-3 w-3 text-emerald-400" />,
        };
      case "High Impact":
        return {
          badgeClass: "bg-teal-950/80 border-teal-500/60 text-teal-300 shadow-teal-950/50",
          pillClass: "bg-teal-500/20 text-teal-300 border-teal-500/30",
          icon: <ShieldCheck className="h-3 w-3 text-teal-400" />,
        };
      case "Moderate":
        return {
          badgeClass: "bg-amber-950/80 border-amber-500/60 text-amber-300 shadow-amber-950/50",
          pillClass: "bg-amber-500/20 text-amber-300 border-amber-500/30",
          icon: <Award className="h-3 w-3 text-amber-400" />,
        };
      default:
        return {
          badgeClass: "bg-zinc-900 border-zinc-700 text-zinc-300 shadow-black/50",
          pillClass: "bg-zinc-800 text-zinc-400 border-zinc-700",
          icon: <Leaf className="h-3 w-3 text-zinc-400" />,
        };
    }
  };

  const { badgeClass, pillClass, icon } = getTierStyles(tier);

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 backdrop-blur-md transition-all shadow-sm ${
        size === "sm" ? "text-xs" : "text-sm py-1.5 px-3"
      } ${badgeClass} ${onClick ? "cursor-pointer hover:scale-[1.02]" : ""} ${className}`}
      data-testid="sustainability-score-badge"
    >
      <span className="flex items-center gap-1 font-bold">
        {icon}
        <span className="font-mono tracking-tight">{score}</span>
        <span className="text-[10px] text-zinc-400 font-normal">/100</span>
      </span>

      <Badge
        variant="outline"
        className={`px-1.5 py-0 text-[10px] font-semibold border ${pillClass}`}
      >
        {tier}
      </Badge>
    </div>
  );
};
