"use client";

import React from "react";
import { ShieldCheck, TrendingUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type FundingModelValue = "all-or-nothing" | "keep-what-you-raise";

interface FundingModelBadgeProps {
  model: FundingModelValue;
  /** Show an explanatory tooltip on hover. Default: true */
  showTooltip?: boolean;
  className?: string;
}

const MODEL_CONFIG: Record<
  FundingModelValue,
  { label: string; description: string; icon: React.ReactNode; colors: string }
> = {
  "all-or-nothing": {
    label: "All-or-Nothing",
    description:
      "Your pledge is only charged if the campaign reaches its minimum goal by the deadline. If the goal isn't met, you receive a full automatic refund.",
    icon: <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />,
    colors:
      "bg-purple-500/10 text-purple-300 border border-purple-500/30",
  },
  "keep-what-you-raise": {
    label: "Keep-What-You-Raise",
    description:
      "The creator keeps all funds raised regardless of whether the goal is met. Pledges are not refunded if the goal isn't reached.",
    icon: <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />,
    colors:
      "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30",
  },
};

/**
 * Small badge that displays the campaign funding model.
 *
 * Used on campaign detail pages and checkout flows to keep backers informed
 * about refund behaviour.
 */
export function FundingModelBadge({
  model,
  showTooltip = true,
  className = "",
}: FundingModelBadgeProps) {
  const config = MODEL_CONFIG[model];

  const badge = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.colors} ${className}`}
      aria-label={`Funding model: ${config.label}`}
    >
      {config.icon}
      {config.label}
    </span>
  );

  if (!showTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="max-w-xs border-zinc-700 bg-zinc-900 text-zinc-200"
      >
        <p className="text-xs leading-relaxed">{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default FundingModelBadge;
