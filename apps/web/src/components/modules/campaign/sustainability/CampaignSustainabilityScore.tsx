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
  /** The four sustainability pillars of the campaign. */
  treeSpeciesDiversity: number;
  regionClimateImpact: number;
  soilHealthImprovement: number;
  biodiversityPotential: number;
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
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function normalizeTreeSpeciesDiversity(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return clamp0100((count / MAX_SPECIES) * 100);
}

export function calculateSustainabilityScore(
  input: CampaignSustainabilityInput,
): SustainabilityScoreResult {
  const breakdown: SustainabilityBreakdown = {
    treeSpeciesDiversity: normalizeTreeSpeciesDiversity(input.treeSpeciesDiversity),
    regionClimateImpact: clamp0100(input.regionClimateImpact),
    soilHealthImprovement: clamp0100(input.soilHealthImprovement),
    biodiversityPotential: clamp0100(input.biodiversityPotential),
  };

  const weighted =
    breakdown.treeSpeciesDiversity * WEIGHTS.treeSpeciesDiversity +
    breakdown.regionClimateImpact * WEIGHTS.regionClimateImpact +
    breakdown.soilHealthImprovement * WEIGHTS.soilHealthImprovement +
    breakdown.biodiversityPotential * WEIGHTS.biodiversityPotential;

  const score = Math.round(clamp0100(weighted));
  const grade: SustainabilityScoreResult["grade"] =
    score >= 70 ? "Strong" : score >= 40 ? "Moderate" : "Limited";

  return { score, grade, breakdown };
}

const GRADE_STYLES: Record<SustainabilityScoreResult["grade"], string> = {
  Strong: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  Moderate: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  Limited: "bg-rose-500/10 text-rose-700 border-rose-500/30",
};

const PILLAR_LABELS: Record<keyof SustainabilityBreakdown, string> = {
  treeSpeciesDiversity: "Tree species diversity",
  regionClimateImpact: "Region climate impact",
  soilHealthImprovement: "Soil health improvement",
  biodiversityPotential: "Biodiversity potential",
};

export default function CampaignSustainabilityScore({
  treeSpeciesDiversity,
  regionClimateImpact,
  soilHealthImprovement,
  biodiversityPotential,
  className,
}: CampaignSustainabilityScoreProps) {
  const result = useMemo(
    () =>
      calculateSustainabilityScore({
        treeSpeciesDiversity,
        regionClimateImpact,
        soilHealthImprovement,
        biodiversityPotential,
      }),
    [treeSpeciesDiversity, regionClimateImpact, soilHealthImprovement, biodiversityPotential],
  );

  return (
    <section
      aria-label="Campaign sustainability score"
      className={[
        "rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900",
        className,
      ].filter(Boolean).join(" ").trim()}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Sustainability score
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Environmental index derived from ecological impact metrics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-4xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100">
            {result.score}
          </span>
          <span className="text-sm text-neutral-500 dark:text-neutral-400">/100</span>
        </div>
      </header>

      <div className="mt-4 flex items-center gap-3">
        <span
          className={[
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
            GRADE_STYLES[result.grade],
          ].join(" ")}
        >
          {result.grade} sustainability
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${result.score}%` }}
          />
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(Object.keys(result.breakdown) as Array<keyof SustainabilityBreakdown>).map((key) => (
          <div key={key} className="rounded-none bg-neutral-50 p-3 dark:bg-neutral-800/50">
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {PILLAR_LABELS[key]}
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
              {Math.round(result.breakdown[key])}/100
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Also available as a named export for pages that prefer named imports.
export { CampaignSustainabilityScore };
