"use client";

import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Sparkles,
  TreePine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TIMELINE_OPTIONS,
  type TreeGrowthStageMetrics,
  type TreeGrowthTimeline,
} from "@/lib/tree-growth";

export interface TreeGrowthTimelineControlsProps {
  currentTimeline: TreeGrowthTimeline;
  metrics: TreeGrowthStageMetrics;
  scaleMultiplier: number;
  showReticle: boolean;
  onTimelineChange: (timeline: TreeGrowthTimeline) => void;
  onScaleChange: (scale: number) => void;
  onToggleReticle: () => void;
  className?: string;
}

export const TreeGrowthTimelineControls: React.FC<TreeGrowthTimelineControlsProps> = ({
  currentTimeline,
  metrics,
  scaleMultiplier,
  showReticle,
  onTimelineChange,
  onScaleChange,
  onToggleReticle,
  className = "",
}) => {
  const currentIndex = TIMELINE_OPTIONS.findIndex((opt) => opt.id === currentTimeline);

  const handlePrev = () => {
    if (currentIndex > 0) {
      onTimelineChange(TIMELINE_OPTIONS[currentIndex - 1].id);
    }
  };

  const handleNext = () => {
    if (currentIndex < TIMELINE_OPTIONS.length - 1) {
      onTimelineChange(TIMELINE_OPTIONS[currentIndex + 1].id);
    }
  };

  return (
    <div
      className={`w-full max-w-xl mx-auto space-y-3 z-30 pointer-events-auto ${className}`}
      data-testid="ar-timeline-controls"
    >
      {/* Real-time Environmental Metrics HUD */}
      <div className="rounded-2xl border border-zinc-700/60 bg-zinc-950/85 p-3.5 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5 mb-2.5">
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-600/90 text-white font-semibold text-[11px] px-2.5 py-0.5 shadow-sm">
              <TreePine className="mr-1 h-3 w-3" /> {metrics.years === 0 ? "Planted" : `${metrics.years} Years`}
            </Badge>
            <span className="text-xs font-semibold text-zinc-100">{metrics.stageName}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleReticle}
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                showReticle
                  ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-300"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
              title="Toggle placement reticle"
              aria-label="Toggle placement reticle"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onScaleChange(Math.max(0.6, scaleMultiplier - 0.15))}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Shrink model"
              aria-label="Shrink model"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onScaleChange(Math.min(1.8, scaleMultiplier + 0.15))}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Enlarge model"
              aria-label="Enlarge model"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* 4-Stat Micro Grid */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Height</p>
            <p className="mt-0.5 text-base font-extrabold text-white">{metrics.heightMeters}m</p>
            <p className="text-[9px] text-zinc-500 font-mono">crown peak</p>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Canopy</p>
            <p className="mt-0.5 text-base font-extrabold text-emerald-400">
              {metrics.canopyDiameterMeters}m
            </p>
            <p className="text-[9px] text-zinc-500 font-mono">diameter</p>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">CO2 Offset</p>
            <p className="mt-0.5 text-base font-extrabold text-teal-300">
              {metrics.cumulativeCo2Kg > 1000
                ? `${metrics.cumulativeCo2Tonnes}t`
                : `${metrics.cumulativeCo2Kg}kg`}
            </p>
            <p className="text-[9px] text-zinc-500 font-mono">sequestered</p>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Oxygen</p>
            <p className="mt-0.5 text-base font-extrabold text-blue-300">
              {metrics.oxygenProducedKg}kg
            </p>
            <p className="text-[9px] text-zinc-500 font-mono">generated</p>
          </div>
        </div>

        {/* Narrative Description Snippet */}
        <p className="mt-2 text-[11px] text-zinc-300 leading-snug line-clamp-2 px-1">
          {metrics.description}
        </p>
      </div>

      {/* Segmented Timeline Switcher: Day 1, 5y, 10y, 20y */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl border border-zinc-700/60 bg-zinc-950/90 backdrop-blur-xl shadow-2xl">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handlePrev}
          disabled={currentIndex <= 0}
          className="h-9 w-9 p-0 text-zinc-400 hover:text-white disabled:opacity-30"
          aria-label="Previous growth stage"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="grid grid-cols-4 gap-1 flex-1">
          {TIMELINE_OPTIONS.map((option) => {
            const isSelected = option.id === currentTimeline;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onTimelineChange(option.id)}
                className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  isSelected
                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-400/50 scale-[1.02]"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80"
                }`}
                aria-pressed={isSelected}
              >
                <span>{option.label}</span>
                <span
                  className={`text-[9px] font-normal uppercase tracking-wider ${
                    isSelected ? "text-emerald-100" : "text-zinc-500"
                  }`}
                >
                  {option.badge}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleNext}
          disabled={currentIndex >= TIMELINE_OPTIONS.length - 1}
          className="h-9 w-9 p-0 text-zinc-400 hover:text-white disabled:opacity-30"
          aria-label="Next growth stage"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
