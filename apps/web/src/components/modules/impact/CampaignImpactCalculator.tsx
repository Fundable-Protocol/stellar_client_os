"use client";

import { useMemo, useState } from "react";
import AppSelect from "@/components/molecules/AppSelect";
import { Input } from "@/components/ui/input";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  calculateCo2Forecast,
  calculateCo2Offset,
  DEFAULT_SPECIES_ID,
  FORECAST_HORIZON_YEARS,
  TREE_SPECIES,
} from "@/lib/co2-impact";
import { SPECIES_PROFILES } from "@/lib/tree-growth";
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

/**
 * Resolve a campaign tree type (e.g. "Mangrove", "Fruit Tree") to its CO2
 * species id. Campaign types that already are species ids pass through;
 * anything unknown falls back to the default species.
 */
function resolveCampaignSpeciesId(campaignSpeciesId?: string): string {
  if (!campaignSpeciesId) return DEFAULT_SPECIES_ID;
  const id = campaignSpeciesId.toLowerCase();
  if (TREE_SPECIES.some((species) => species.id === id)) return id;
  const profile = SPECIES_PROFILES[campaignSpeciesId];
  return profile?.co2SpeciesId ?? DEFAULT_SPECIES_ID;
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
  const [speciesId, setSpeciesId] = useState<string>(resolveCampaignSpeciesId(campaignSpeciesId));
  const [quantity, setQuantity] = useState<string>(campaignTreeCount?.toString() || "10");
  const [growthRate, setGrowthRate] = useState<string>("1.0");

  // Keep the interactive inputs in sync with campaign values by adjusting
  // state during render (the react.dev "adjusting state on prop change"
  // pattern) instead of setState-in-effect, which the react-hooks lint
  // rules flag as a cascading-render hazard.
  const [lastSpeciesProp, setLastSpeciesProp] = useState(campaignSpeciesId);
  if (campaignSpeciesId && campaignSpeciesId !== lastSpeciesProp) {
    setLastSpeciesProp(campaignSpeciesId);
    setSpeciesId(resolveCampaignSpeciesId(campaignSpeciesId));
  }

  const [lastTreeCountProp, setLastTreeCountProp] = useState(campaignTreeCount);
  if (campaignTreeCount !== undefined && campaignTreeCount !== lastTreeCountProp) {
    setLastTreeCountProp(campaignTreeCount);
    setQuantity(campaignTreeCount.toString());
  }

  const parsedQuantity = Number.parseInt(quantity, 10);
  const quantityValue = Number.isFinite(parsedQuantity) ? parsedQuantity : 0;
  
  const parsedGrowthRate = Number.parseFloat(growthRate);
  const growthRateValue = Number.isFinite(parsedGrowthRate) && parsedGrowthRate > 0 ? parsedGrowthRate : 1.0;

  const result = useMemo(
    () => calculateCo2Offset(speciesId, quantityValue, undefined, growthRateValue),
    [speciesId, quantityValue, growthRateValue],
  );
  const forecast = useMemo(
    () => calculateCo2Forecast(speciesId, quantityValue),
    [speciesId, quantityValue],
  );
  const finalForecast = forecast[forecast.length - 1];

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
          Campaign Impact Calculator
        </h2>
        <p className="text-sm text-zinc-400">
          Real-time CO2 sequestration based on tree count, species, and estimated growth rate. Updates as sponsors contribute.
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
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
            <p className="text-xs text-zinc-500">Tree species</p>
            <p className="text-sm font-semibold text-white">{result.speciesLabel}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
            <p className="text-xs text-zinc-500">Trees funded</p>
            <p className="text-sm font-semibold text-white">{result.quantity.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
            <p className="text-xs text-zinc-500">Est. growth rate</p>
            <p className="text-sm font-semibold text-white">{growthRateValue.toFixed(1)}×</p>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-live="polite">
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

      <section
        aria-labelledby="campaign-impact-forecast-heading"
        className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3
              id="campaign-impact-forecast-heading"
              className="text-base font-semibold text-white"
            >
              {FORECAST_HORIZON_YEARS}-year CO2 sequestration forecast
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              Model estimate accounts for species growth, annual tree mortality,
              and a climate adjustment factor.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
            <p className="text-xs text-zinc-300">
              Year {finalForecast.year} cumulative estimate
            </p>
            <p className="mt-1 text-xl font-bold text-emerald-200">
              {formatNumber(finalForecast.expectedCumulativeKg)} kg
            </p>
            <p className="text-xs text-zinc-300">
              95% confidence interval: {formatNumber(finalForecast.lower95Kg)}–
              {formatNumber(finalForecast.upper95Kg)} kg
            </p>
          </div>
        </div>

        <div
          aria-label="Twenty-year cumulative CO2 forecast with 95% confidence interval"
          className="mt-5 h-64 w-full"
          role="img"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecast} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="year"
                stroke="#a1a1aa"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(year: number) => `${year}y`}
              />
              <YAxis
                stroke="#a1a1aa"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => formatNumber(value)}
                width={56}
              />
              <Tooltip
                formatter={(value, name) => [
                  `${formatNumber(Number(value))} kg`,
                  String(name),
                ]}
                labelFormatter={(year) => `Year ${year}`}
                contentStyle={{ backgroundColor: "#09090b", borderColor: "#3f3f46" }}
              />
              <Line
                dataKey="lower95Kg"
                name="95% lower bound"
                stroke="#67e8f9"
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="expectedCumulativeKg"
                name="Expected cumulative CO2"
                stroke="#34d399"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="upper95Kg"
                name="95% upper bound"
                stroke="#fbbf24"
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
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

        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-zinc-200">
            View annual forecast data
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <caption className="sr-only">
                Annual cumulative CO2 sequestration estimate and 95% confidence
                interval in kilograms
              </caption>
              <thead className="text-zinc-300">
                <tr>
                  <th scope="col" className="px-3 py-2">Year</th>
                  <th scope="col" className="px-3 py-2">95% lower (kg)</th>
                  <th scope="col" className="px-3 py-2">Expected (kg)</th>
                  <th scope="col" className="px-3 py-2">95% upper (kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 text-zinc-200">
                {forecast.map((point) => (
                  <tr key={point.year}>
                    <th scope="row" className="px-3 py-2 font-medium">
                      {point.year}
                    </th>
                    <td className="px-3 py-2">{formatNumber(point.lower95Kg)}</td>
                    <td className="px-3 py-2">{formatNumber(point.expectedCumulativeKg)}</td>
                    <td className="px-3 py-2">{formatNumber(point.upper95Kg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <p className="mt-3 text-xs text-zinc-400">
          Estimates use independent normal uncertainty assumptions for growth,
          mortality, and climate factors. They are planning estimates, not
          verified carbon credits or a guarantee of field outcomes.
        </p>
      </section>
      </div>
    </section>
  );
}

export default CampaignImpactCalculator;

