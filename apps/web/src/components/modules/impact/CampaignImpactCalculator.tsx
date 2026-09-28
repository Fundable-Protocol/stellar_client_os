"use client";

import { useMemo, useState, useEffect } from "react";
import AppSelect from "@/components/molecules/AppSelect";
import { Input } from "@/components/ui/input";
import {
  calculateCo2Offset,
  DEFAULT_SPECIES_ID,
  TREE_SPECIES,
} from "@/lib/co2-impact";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const SPECIES_OPTIONS = TREE_SPECIES.map((species) => ({
  label: species.label,
  value: species.id,
}));

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}

export interface CampaignImpactCalculatorProps {
  campaignSpeciesId?: string;
  campaignTreeCount?: number;
  readOnly?: boolean;
}

export function CampaignImpactCalculator({
  campaignSpeciesId,
  campaignTreeCount,
  readOnly,
}: CampaignImpactCalculatorProps = {}) {
  const [speciesId, setSpeciesId] = useState<string>(campaignSpeciesId || DEFAULT_SPECIES_ID);
  const [quantity, setQuantity] = useState<string>(campaignTreeCount?.toString() || "10");
  const [growthRate, setGrowthRate] = useState<string>("1.0");

  useEffect(() => {
    if (campaignSpeciesId && TREE_SPECIES.find((s) => s.id === campaignSpeciesId.toLowerCase())) {
      setSpeciesId(campaignSpeciesId.toLowerCase());
    }
  }, [campaignSpeciesId]);

  useEffect(() => {
    if (campaignTreeCount !== undefined) {
      setQuantity(campaignTreeCount.toString());
    }
  }, [campaignTreeCount]);

  const parsedQuantity = Number.parseInt(quantity, 10);
  const quantityValue = Number.isFinite(parsedQuantity) ? parsedQuantity : 0;
  
  const parsedGrowthRate = Number.parseFloat(growthRate);
  const growthRateValue = Number.isFinite(parsedGrowthRate) && parsedGrowthRate > 0 ? parsedGrowthRate : 1.0;

  const result = useMemo(
    () => calculateCo2Offset(speciesId, quantityValue, undefined, growthRateValue),
    [speciesId, quantityValue, growthRateValue],
  );

  const chartData = useMemo(() => {
    const data = [];
    let cumulativeCampaign = 0;
    let cumulativeBaseline = 0;
    let cumulativeSimilar = 0;

    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 10; i++) {
      const year = currentYear - 9 + i;
      // Assume a growth curve where CO2 sequestration increases as trees mature
      const maturityFactor = Math.min(1, (i + 1) / 10);
      
      const yearlyCampaign = result.co2PerYearKg * maturityFactor;
      cumulativeCampaign += yearlyCampaign;
      
      // Baseline natural regeneration (40% of planted campaign)
      const yearlyBaseline = (result.co2PerYearKg * 0.4) * maturityFactor; 
      cumulativeBaseline += yearlyBaseline;

      // Similar campaigns average (80% of current campaign due to lower survival rate)
      const yearlySimilar = (result.co2PerYearKg * 0.8) * maturityFactor;
      cumulativeSimilar += yearlySimilar;

      data.push({
        year: year.toString(),
        campaign: Math.round(cumulativeCampaign),
        baseline: Math.round(cumulativeBaseline),
        similar: Math.round(cumulativeSimilar),
      });
    }
    return data;
  }, [result.co2PerYearKg]);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-white">
          Real-Time CO2 Sequestration (v2)
        </h2>
        <p className="text-sm text-zinc-400">
          Projected CO2 offset based on tree count, species, and estimated growth rate. Updates as contributions arrive.
        </p>
      </div>

      {!readOnly && (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <p className="mb-1.5 ml-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
              Tree species
            </p>
            <AppSelect
              options={SPECIES_OPTIONS}
              value={speciesId}
              setValue={setSpeciesId}
              placeholder="Select a species"
              className="bg-zinc-900 border-zinc-700 text-white"
            />
          </div>

          <div>
            <label
              htmlFor="co2-quantity"
              className="mb-1.5 ml-1 block text-xs font-medium uppercase tracking-[0.08em] text-zinc-500"
            >
              Number of trees
            </label>
            <Input
              id="co2-quantity"
              type="number"
              min={0}
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white"
            />
          </div>

          <div>
            <label
              htmlFor="growth-rate"
              className="mb-1.5 ml-1 block text-xs font-medium uppercase tracking-[0.08em] text-zinc-500"
            >
              Est. Growth Rate
            </label>
            <Input
              id="growth-rate"
              type="number"
              step="0.1"
              min="0.1"
              inputMode="decimal"
              value={growthRate}
              onChange={(event) => setGrowthRate(event.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white"
            />
          </div>
        </div>
      )}

      {readOnly && (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <p className="mb-1.5 ml-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
              Est. Growth Rate Mult.
            </p>
            <Input
              id="growth-rate-readonly"
              type="number"
              step="0.1"
              min="0.1"
              inputMode="decimal"
              value={growthRate}
              onChange={(event) => setGrowthRate(event.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white"
            />
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs text-zinc-400">CO2 offset / year</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">
            {formatNumber(result.co2PerYearKg)}
          </p>
          <p className="text-xs text-zinc-500">kg ≈ {formatNumber(result.co2PerYearTonnes, 2)} t</p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs text-zinc-400">CO2 offset over 10 years</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">
            {formatNumber(result.co2Over10YearsKg)}
          </p>
          <p className="text-xs text-zinc-500">kg ≈ {formatNumber(result.co2Over10YearsTonnes, 2)} t</p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs text-zinc-400">Species</p>
          <p className="mt-1 text-2xl font-bold text-white">{result.speciesLabel}</p>
          <p className="text-xs text-zinc-500">
            {result.quantity} trees @ {result.co2PerTreePerYearKg} kg/tree/yr
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs text-zinc-400">🚗 Driving avoided / year</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {formatNumber(result.carKmEquivalentPerYear)}
          </p>
          <p className="text-xs text-zinc-500">km in an average car</p>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">Historical CO2 Sequestration</h3>
          <p className="text-xs text-zinc-400">Comparing cumulative CO2 sequestration (kg) over time against baselines.</p>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="year" stroke="#71717a" fontSize={12} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={12} tickLine={false} tickFormatter={(value) => `${formatNumber(value)}kg`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", fontSize: 12 }}
                formatter={(value: number) => [`${formatNumber(value)} kg`, undefined]}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
              <Line
                type="monotone"
                dataKey="campaign"
                name="This Campaign"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ r: 4, fill: "#10b981" }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="similar"
                name="Similar Campaigns"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 3, fill: "#6366f1" }}
              />
              <Line
                type="monotone"
                dataKey="baseline"
                name="Baseline (Natural Growth)"
                stroke="#71717a"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

export default CampaignImpactCalculator;

