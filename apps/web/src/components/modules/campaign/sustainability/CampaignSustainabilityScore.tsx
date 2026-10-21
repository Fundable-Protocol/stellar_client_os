"use client";

import { useMemo } from "react";

export interface CampaignSustainabilityInput {
  /** Number of distinct tree species planted by the campaign. */
  treeSpeciesDiversity: number;
  /** Region climate impact score (0 - 100). */
  regionClimateImpact: number;
  /** Soil health improvement score (0 - 100). */
  soilHealthImprovement: number;
  /** Biodiversity potential score (0 - 100). */
  biodiversityPotential: number;
}

export interface CampaignSustainabilityScoreProps {
  data: CampaignSustainabilityInput;
  className?: string;
}

export interface SustainabilityBreakdown {
  treeSpeciesDiversity: number;
  regionClimateImpact: number;
  soilHealthImprovement: number;
  biodiversityPotential: number;
}

export interface SustainabilityScoreResult {
  score: number;
  grade: "Strong" | "Moderate" | "Limited";
  breakdown: SustainabilityBreakdown;
}

/** Weights applied to each sustainability pillar. Sum to 1. */
const WEIGHTS = {
  treeSpeciesDiversity: 0.3,
  regionClimateImpact: 0.25,
  soilHealthImprovement: 0.25,
  biodiversityPotential: 0.2,
} as const;

/** Number of distinct species that saturates the diversity pillar. */
const MAX_SPECIES = 20;

function clamp0100(value: number): number {
  if (!Number.finite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function normalizeTreeSpeciesDiversity(count: number): number {
  if (!Number.finite(count) || count <= 0) return 0;
  return clamp0100((count / MAX_SPECIES) * 100);
}

export function calculateSustainabilityScore(
  input: CampaignSustainabilityInput,
): SustainabilityScoreResult {
  const treeSpeciesDiversity = clamp0100(input.treeSpeciesDiversity);
  const regionClimateImpact = clamp0100(input.regionClimateImpact);
  const soilHealthImprovement = clamp0100(input.soilHealthImprovement);
  const biodiversityPotential = clamp0100(input.biodiversityPotential);

  const score = Math.round(
    treeSpeciesDiversity * WEIGHTS.treeSpeciesDiversity +
      regionClimateImpact * WEIGHTS.regionClimateImpact +
      soilHealthImprovement * WEIGHTS.soilHealthImprovement +
      biodiversityPotential * WEIGHTS.biodiversityPotential,
  );
  const grade = score >= 80 ? "Strong" : score >= 55 ? "Moderate" : "Limited";

  return {
    score,
    grade,
    breakdown: {
      treeSpeciesDiversity,
      regionClimateImpact,
      soilHealthImprovement,
      biodiversityPotential,
    },
  };
}

const PILLAR_LABELS: Record<keyof SustainabilityBreakdown, string> = {
  treeSpeciesDiversity: "Tree species diversity",
  regionClimateImpact: "Region climate impact",
  soilHealthImprovement: "Soil health improvement",
  biodiversityPotential: "Biodiversity potential",
};

export default function CampaignSustainabilityScore({ data, className }: CampaignSustainabilityScoreProps) {
  const result = useMemo(() => calculateSustainabilityScore(data), [data]);

  return (
    <section
      aria-label="Campaign sustainability score"
      className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 ${className ?? ""}`.trim()}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-50">Sustainability score</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Environmental index derived from ecological impact metrics.
          </p>
        </div>
        <div className="text-right">
          <span className="text-3xl font-extrabold text-emerald-400">{result.score}</span>
          <span className="text-sm text-zinc-500">/100</span>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">{result.grade}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(PILLAR_LABELS) as Array<keyof SustainabilityBreakdown>).map((key) => (
          <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <dt className="text-xs text-zinc-500">{PILLAR_LABELS[key]}</dt>
            <dd className="mt-1 text-sm font-bold text-zinc-100">{result.breakdown[key]}/100</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
