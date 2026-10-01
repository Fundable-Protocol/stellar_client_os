"use client";

/**
 * CO2SequestrationProjection
 *
 * Displays a 20-year projected CO2 sequestration chart with a 95% confidence
 * interval band.  Accounts for:
 *   - Species-specific Chapman-Richards growth curves
 *   - Annual tree mortality compounding over time
 *   - Three climate scenarios (Optimistic / Moderate / Pessimistic)
 *
 * Uses Recharts ComposedChart: an Area for the CI band and a Line for the
 * median projection.  Follows the dark zinc / emerald colour palette used
 * throughout the dashboard.
 *
 * Closes issue: "Show projected CO2 sequestration over 20 years with 95%
 * confidence interval. Account for tree mortality, growth rates, climate factors."
 */

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info, Leaf, TreePine } from "lucide-react";
import AppSelect from "@/components/molecules/AppSelect";
import { Input } from "@/components/ui/input";
import {
  generateCo2Projection,
  climateScenarioLabel,
  TREE_SPECIES,
  type Co2ProjectionInput,
} from "@/lib/co2-sequestration-projection";

// ── Constants ─────────────────────────────────────────────────────────────────

const SPECIES_OPTIONS = TREE_SPECIES.map((s) => ({
  label: s.label,
  value: s.id,
}));

const CLIMATE_OPTIONS: {
  label: string;
  value: Co2ProjectionInput["climateScenario"];
}[] = [
  { label: climateScenarioLabel("optimistic"), value: "optimistic" },
  { label: climateScenarioLabel("moderate"), value: "moderate" },
  { label: climateScenarioLabel("pessimistic"), value: "pessimistic" },
];

const CHART_COLORS = {
  median: "#10b981", // emerald-500
  ciArea: "#10b98133", // emerald with 20 % opacity
  ciBorder: "#10b98166", // emerald with 40 % opacity
  grid: "#27272a", // zinc-800
  axis: "#71717a", // zinc-500
  tooltipBg: "#18181b", // zinc-950
  tooltipBorder: "#27272a",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatKg(kg: number): string {
  if (kg >= 1_000_000) return `${(kg / 1_000_000).toFixed(1)} Mt`;
  if (kg >= 1_000) return `${(kg / 1_000).toFixed(1)} t`;
  return `${Math.round(kg).toLocaleString("en-US")} kg`;
}

function formatKgLabel(kg: number): string {
  return `${Math.round(kg).toLocaleString("en-US")} kg`;
}

// Custom tooltip for the chart
function ProjectionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const ciEntry = payload.find((p) => p.name === "ci");
  const medianEntry = payload.find((p) => p.name === "median");

  const ciLow = Array.isArray(ciEntry?.value)
    ? (ciEntry.value as [number, number])[0]
    : undefined;
  const ciHigh = Array.isArray(ciEntry?.value)
    ? (ciEntry.value as [number, number])[1]
    : undefined;
  const median = medianEntry?.value;

  return (
    <div
      className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs shadow-xl"
      style={{ minWidth: 180 }}
    >
      <p className="font-semibold text-zinc-300 mb-1.5">{label}</p>
      {median !== undefined && (
        <p className="text-emerald-400">
          Median: <strong>{formatKgLabel(median)}</strong>
        </p>
      )}
      {ciLow !== undefined && ciHigh !== undefined && (
        <p className="text-zinc-400 mt-0.5">
          95% CI: {formatKgLabel(ciLow)} – {formatKgLabel(ciHigh)}
        </p>
      )}
    </div>
  );
}

// ── Component props ───────────────────────────────────────────────────────────

export interface CO2SequestrationProjectionProps {
  /**
   * When set, the species selector and tree count input become read-only and
   * are pre-populated with the campaign values.  The user can still change the
   * climate scenario.
   */
  campaignSpeciesId?: string;
  campaignTreeCount?: number;
  /** Compact variant that hides controls.  Useful when embedding in a card. */
  compact?: boolean;
  className?: string;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CO2SequestrationProjection({
  campaignSpeciesId,
  campaignTreeCount,
  compact = false,
  className = "",
}: CO2SequestrationProjectionProps) {
  const defaultSpecies = campaignSpeciesId ?? TREE_SPECIES[0].id;
  const defaultCount = campaignTreeCount?.toString() ?? "100";

  const [speciesId, setSpeciesId] = useState<string>(defaultSpecies);
  const [treeCountStr, setTreeCountStr] = useState<string>(defaultCount);
  const [treeAgeStr, setTreeAgeStr] = useState<string>("0");
  const [climateScenario, setClimateScenario] =
    useState<NonNullable<Co2ProjectionInput["climateScenario"]>>("moderate");

  // Propagate parent prop changes (e.g. user switches campaign tab)
  useEffect(() => {
    if (campaignSpeciesId) setSpeciesId(campaignSpeciesId);
  }, [campaignSpeciesId]);

  useEffect(() => {
    if (campaignTreeCount !== undefined)
      setTreeCountStr(campaignTreeCount.toString());
  }, [campaignTreeCount]);

  const treeCount = Math.max(0, parseInt(treeCountStr, 10) || 0);
  const treeAge = Math.max(0, parseInt(treeAgeStr, 10) || 0);

  const projection = useMemo(
    () =>
      generateCo2Projection({
        speciesId,
        treeCount,
        treeAgeYears: treeAge,
        horizonYears: 20,
        climateScenario,
      }),
    [speciesId, treeCount, treeAge, climateScenario]
  );

  // Recharts needs the CI as [low, high] range value for Area
  const chartData = useMemo(
    () =>
      projection.dataPoints.map((pt) => ({
        year: pt.year.toString(),
        median: pt.cumulativeCo2Kg,
        ci: [pt.ci95Low, pt.ci95High] as [number, number],
        annual: pt.annualCo2Kg,
        trees: pt.survivingTrees,
      })),
    [projection]
  );

  const mortalityPct = (projection.annualMortalityRate * 100).toFixed(1);
  const survivingAtHorizon =
    projection.dataPoints[projection.dataPoints.length - 1]?.survivingTrees ??
    0;

  const isControlled = !!campaignSpeciesId || !!campaignTreeCount;

  return (
    <section
      aria-labelledby="co2-projection-heading"
      className={`rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 ${className}`}
    >
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3
            id="co2-projection-heading"
            className="text-lg font-semibold text-white flex items-center gap-2"
          >
            <Leaf className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            20-Year CO₂ Sequestration Projection
          </h3>
          <p className="text-sm text-zinc-400 mt-0.5">
            Projected cumulative CO₂ offset with 95% confidence interval,
            accounting for tree mortality, growth rates, and climate factors.
          </p>
        </div>
      </div>

      {/* Controls */}
      {!compact && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Species */}
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
              Tree species
            </p>
            {isControlled ? (
              <div className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300">
                {TREE_SPECIES.find((s) => s.id === speciesId)?.label ??
                  speciesId}
              </div>
            ) : (
              <AppSelect
                options={SPECIES_OPTIONS}
                value={speciesId}
                setValue={setSpeciesId}
                placeholder="Select species"
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            )}
          </div>

          {/* Tree count */}
          <div>
            <label
              htmlFor="proj-tree-count"
              className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-zinc-500"
            >
              Number of trees
            </label>
            {isControlled ? (
              <div className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300">
                {treeCount.toLocaleString("en-US")}
              </div>
            ) : (
              <Input
                id="proj-tree-count"
                type="number"
                min={0}
                inputMode="numeric"
                value={treeCountStr}
                onChange={(e) => setTreeCountStr(e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            )}
          </div>

          {/* Tree age */}
          <div>
            <label
              htmlFor="proj-tree-age"
              className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-zinc-500"
            >
              Current tree age (yrs)
            </label>
            <Input
              id="proj-tree-age"
              type="number"
              min={0}
              max={50}
              inputMode="numeric"
              value={treeAgeStr}
              onChange={(e) => setTreeAgeStr(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white"
            />
          </div>

          {/* Climate scenario */}
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
              Climate scenario
            </p>
            <AppSelect
              options={CLIMATE_OPTIONS}
              value={climateScenario}
              setValue={(v) =>
                setClimateScenario(
                  v as NonNullable<Co2ProjectionInput["climateScenario"]>
                )
              }
              placeholder="Select scenario"
              className="bg-zinc-900 border-zinc-700 text-white"
            />
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs text-zinc-400">20-yr median</p>
          <p className="mt-1 text-xl font-bold text-emerald-300">
            {formatKg(projection.totalCo2Kg)}
          </p>
          <p className="text-[11px] text-zinc-500">CO₂ sequestered</p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs text-zinc-400">95% CI range</p>
          <p className="mt-1 text-xl font-bold text-white">
            {formatKg(projection.ci95LowKg)}
          </p>
          <p className="text-[11px] text-zinc-500">
            – {formatKg(projection.ci95HighKg)}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs text-zinc-400">Mortality rate</p>
          <p className="mt-1 text-xl font-bold text-white">{mortalityPct}%</p>
          <p className="text-[11px] text-zinc-500">per year / tree</p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs text-zinc-400">Surviving trees</p>
          <p className="mt-1 text-xl font-bold text-amber-300 flex items-center gap-1">
            <TreePine className="h-4 w-4" aria-hidden="true" />
            {survivingAtHorizon.toLocaleString("en-US")}
          </p>
          <p className="text-[11px] text-zinc-500">at year 20</p>
        </div>
      </div>

      {/* Chart */}
      <div
        className="h-[320px] w-full"
        data-testid="co2-projection-chart"
        role="img"
        aria-label={`20-year CO2 sequestration projection for ${projection.speciesLabel} — median ${formatKg(projection.totalCo2Kg)}, 95% CI from ${formatKg(projection.ci95LowKg)} to ${formatKg(projection.ci95HighKg)}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
          >
            <defs>
              {/* CI band fill */}
              <linearGradient id="ciGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={CHART_COLORS.median}
                  stopOpacity={0.25}
                />
                <stop
                  offset="95%"
                  stopColor={CHART_COLORS.median}
                  stopOpacity={0.04}
                />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke={CHART_COLORS.grid}
              vertical={false}
            />

            <XAxis
              dataKey="year"
              stroke={CHART_COLORS.axis}
              fontSize={11}
              tickLine={false}
              tick={{ fill: CHART_COLORS.axis }}
              // Show every 5 years to avoid overcrowding
              interval={4}
            />

            <YAxis
              stroke={CHART_COLORS.axis}
              fontSize={11}
              tickLine={false}
              tick={{ fill: CHART_COLORS.axis }}
              tickFormatter={(v: number) => formatKg(v)}
              width={72}
            />

            <Tooltip
              content={
                <ProjectionTooltip />
              }
            />

            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 12, color: "#a1a1aa" }}
              formatter={(value: string) => {
                if (value === "ci") return "95% Confidence Interval";
                if (value === "median") return "Median Projection";
                return value;
              }}
            />

            {/* CI band — rendered as an Area with [low, high] range */}
            <Area
              type="monotone"
              dataKey="ci"
              name="ci"
              stroke={CHART_COLORS.ciBorder}
              strokeWidth={0}
              fill="url(#ciGradient)"
              activeDot={false}
              legendType="rect"
            />

            {/* Median projection line */}
            <Line
              type="monotone"
              dataKey="median"
              name="median"
              stroke={CHART_COLORS.median}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: CHART_COLORS.median }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footnote */}
      <div className="mt-4 flex items-start gap-2 text-xs text-zinc-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <p>
          Projections use a Chapman-Richards growth model with an annual
          mortality rate of {mortalityPct}% for{" "}
          <span className="text-zinc-400">{projection.speciesLabel}</span>{" "}
          under the{" "}
          <span className="text-zinc-400">
            {climateScenarioLabel(climateScenario)}
          </span>{" "}
          climate scenario. The 95% CI reflects species growth variability,
          climate uncertainty, and stochastic mortality. Forecasts are
          estimates; field verification remains the source of truth.
        </p>
      </div>
    </section>
  );
}

export default CO2SequestrationProjection;
