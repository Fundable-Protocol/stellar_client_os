"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  Globe,
  Info,
  Layers,
  Leaf,
  Sparkles,
  Sprout,
  TreePine,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { calculateSustainabilityScore } from "@/lib/sustainability-score";
import type {
  CampaignSustainabilityScore,
  SustainabilityPillarScore,
} from "@/types/campaign";
import { SustainabilityScoreGauge } from "./SustainabilityScoreGauge";

export interface CampaignSustainabilityCardProps {
  campaignId?: string;
  treeType?: string;
  speciesList?: string[];
  treesPlanted?: number | string;
  location?: string;
  description?: string;
  category?: string;
  initialScore?: CampaignSustainabilityScore;
  className?: string;
}

export const CampaignSustainabilityCard: React.FC<CampaignSustainabilityCardProps> = ({
  treeType = "Oak",
  speciesList,
  treesPlanted = 1500,
  location = "Amazon Basin, Brazil",
  description = "",
  category = "Environmental & Reforestation",
  initialScore,
  className = "",
}) => {
  const [showTransparency, setShowTransparency] = useState(false);

  const scoreData = useMemo(() => {
    if (initialScore) return initialScore;
    return calculateSustainabilityScore({
      treeType,
      speciesList,
      treesPlanted,
      location,
      description,
      category,
    });
  }, [initialScore, treeType, speciesList, treesPlanted, location, description, category]);

  const { totalScore, tier, tierDescription, pillars, recommendations } = scoreData;

  const pillarIcons: Record<string, React.ReactNode> = {
    speciesDiversity: <TreePine className="h-4 w-4 text-emerald-400" />,
    climateImpact: <Globe className="h-4 w-4 text-teal-400" />,
    soilHealth: <Layers className="h-4 w-4 text-amber-400" />,
    biodiversityPotential: <Sprout className="h-4 w-4 text-purple-400" />,
  };

  const pillarColors: Record<string, string> = {
    speciesDiversity: "from-emerald-500 to-teal-500",
    climateImpact: "from-teal-500 to-cyan-500",
    soilHealth: "from-amber-500 to-yellow-500",
    biodiversityPotential: "from-purple-500 to-indigo-500",
  };

  const renderPillarBar = (key: keyof typeof pillars, pillar: SustainabilityPillarScore) => {
    return (
      <div key={key} className="space-y-1.5" data-testid={`pillar-row-${key}`}>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-zinc-200">
            {pillarIcons[key]}
            {pillar.title}
          </span>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-zinc-700 bg-zinc-900 text-zinc-300"
            >
              {pillar.grade}
            </Badge>
            <span className="font-mono font-bold text-zinc-100">
              {pillar.score}
              <span className="text-[10px] text-zinc-500 font-normal">/25</span>
            </span>
          </div>
        </div>

        {/* Horizontal Progress Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800/80">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${pillarColors[key]} transition-all duration-700`}
            style={{ width: `${pillar.percentage}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <section
      className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 backdrop-blur-md shadow-xl space-y-6 ${className}`}
      data-testid="campaign-sustainability-card"
    >
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-600/90 text-white font-semibold text-xs">
              <Leaf className="mr-1 h-3 w-3" /> Sustainability Score
            </Badge>
            <span className="text-xs text-zinc-400 font-medium">Environmental Index (v1)</span>
          </div>
          <h2 className="mt-1 text-xl font-bold text-white tracking-tight">
            Ecosystem Impact Rating
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-emerald-500/40 text-emerald-300 bg-emerald-950/30 text-xs px-2.5 py-1"
          >
            <Sparkles className="mr-1 h-3 w-3 text-emerald-400" />
            Verified Ecological Index
          </Badge>
        </div>
      </div>

      {/* Top Overview: Gauge + Tier Narrative */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        <div className="md:col-span-4 flex justify-center py-2">
          <SustainabilityScoreGauge score={totalScore} tier={tier} size={145} />
        </div>

        <div className="md:col-span-8 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
              Rating:
            </span>
            <span className="text-sm font-extrabold text-emerald-400">{tier}</span>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{tierDescription}</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold">
                Species Base
              </span>
              <strong className="text-zinc-200">{treeType}</strong>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold">
                Ecoregion
              </span>
              <strong className="text-zinc-200 truncate block">{location}</strong>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2 col-span-2 sm:col-span-1">
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold">
                Planted Scope
              </span>
              <strong className="text-zinc-200 font-mono">{treesPlanted} Trees</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Pillars Breakdown Progress Bars */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Category Breakdown (0–25 points each)
          </h3>
          <span className="text-xs font-mono text-zinc-500">Total: {totalScore}/100</span>
        </div>

        <div className="space-y-3.5">
          {renderPillarBar("speciesDiversity", pillars.speciesDiversity)}
          {renderPillarBar("climateImpact", pillars.climateImpact)}
          {renderPillarBar("soilHealth", pillars.soilHealth)}
          {renderPillarBar("biodiversityPotential", pillars.biodiversityPotential)}
        </div>
      </div>

      {/* Expandable Transparency Breakdown: "Why this score?" */}
      <div className="border-t border-zinc-800/80 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowTransparency(!showTransparency)}
          className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-white py-2"
          aria-expanded={showTransparency}
        >
          <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <Info className="h-3.5 w-3.5" />
            {showTransparency ? "Hide Score Breakdown & Rationale" : "Why this score? View transparent breakdown"}
          </span>
          {showTransparency ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>

        {showTransparency && (
          <div
            className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs"
            data-testid="transparency-breakdown"
          >
            {/* Diversity Rationale */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5 space-y-2">
              <div className="flex items-center justify-between font-semibold text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <TreePine className="h-3.5 w-3.5 text-emerald-400" />
                  Species Diversity
                </span>
                <span className="font-mono text-xs">{pillars.speciesDiversity.score}/25</span>
              </div>
              <p className="text-zinc-300 text-[11px] leading-relaxed">
                {pillars.speciesDiversity.rationale}
              </p>
              <ul className="text-[10px] text-zinc-400 space-y-1 pt-1">
                {pillars.speciesDiversity.highlights.map((h, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Climate Rationale */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5 space-y-2">
              <div className="flex items-center justify-between font-semibold text-teal-300">
                <span className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-teal-400" />
                  Regional Climate Impact
                </span>
                <span className="font-mono text-xs">{pillars.climateImpact.score}/25</span>
              </div>
              <p className="text-zinc-300 text-[11px] leading-relaxed">
                {pillars.climateImpact.rationale}
              </p>
              <ul className="text-[10px] text-zinc-400 space-y-1 pt-1">
                {pillars.climateImpact.highlights.map((h, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-2.5 w-2.5 text-teal-500 shrink-0" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Soil Health Rationale */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5 space-y-2">
              <div className="flex items-center justify-between font-semibold text-amber-300">
                <span className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-amber-400" />
                  Soil Health Improvement
                </span>
                <span className="font-mono text-xs">{pillars.soilHealth.score}/25</span>
              </div>
              <p className="text-zinc-300 text-[11px] leading-relaxed">
                {pillars.soilHealth.rationale}
              </p>
              <ul className="text-[10px] text-zinc-400 space-y-1 pt-1">
                {pillars.soilHealth.highlights.map((h, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Biodiversity Rationale */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5 space-y-2">
              <div className="flex items-center justify-between font-semibold text-purple-300">
                <span className="flex items-center gap-1.5">
                  <Sprout className="h-3.5 w-3.5 text-purple-400" />
                  Biodiversity Potential
                </span>
                <span className="font-mono text-xs">{pillars.biodiversityPotential.score}/25</span>
              </div>
              <p className="text-zinc-300 text-[11px] leading-relaxed">
                {pillars.biodiversityPotential.rationale}
              </p>
              <ul className="text-[10px] text-zinc-400 space-y-1 pt-1">
                {pillars.biodiversityPotential.highlights.map((h, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-2.5 w-2.5 text-purple-500 shrink-0" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Creator Recommendations Banner */}
      {recommendations.length > 0 && (
        <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 uppercase tracking-wide">
            <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
            Ecological Recommendations to Boost Score
          </div>
          <ul className="text-xs text-amber-200/90 space-y-1.5 pl-1">
            {recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">&bull;</span>
                <span className="leading-snug">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
