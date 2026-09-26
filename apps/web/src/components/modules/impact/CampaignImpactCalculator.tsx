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

const SPECIES_OPTIONS = TREE_SPECIES.map((species) => ({
  label: species.label,
  value: species.id,
}));

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}

export function CampaignImpactCalculator() {
  const [speciesId, setSpeciesId] = useState<string>(DEFAULT_SPECIES_ID);
  const [quantity, setQuantity] = useState<string>("10");

  const parsedQuantity = Number.parseInt(quantity, 10);
  const quantityValue = Number.isFinite(parsedQuantity) ? parsedQuantity : 0;

  const result = useMemo(
    () => calculateCo2Offset(speciesId, quantityValue),
    [speciesId, quantityValue],
  );
  const forecast = useMemo(
    () => calculateCo2Forecast(speciesId, quantityValue),
    [speciesId, quantityValue],
  );
  const finalForecast = forecast[forecast.length - 1];

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-white">
          Campaign Impact Calculator
        </h2>
        <p className="text-sm text-zinc-400">
          Estimate the projected CO2 offset of a tree-planting campaign based
          on species and quantity. Figures are indicative estimates for mature
          trees.
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
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
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs text-zinc-400">CO2 offset / year</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">
            {formatNumber(result.co2PerYearKg)}
          </p>
          <p className="text-xs text-zinc-500">kg · {formatNumber(result.co2PerYearTonnes, 2)} t</p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs text-zinc-400">CO2 offset over 10 years</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">
            {formatNumber(result.co2Over10YearsKg)}
          </p>
          <p className="text-xs text-zinc-500">kg · {formatNumber(result.co2Over10YearsTonnes, 2)} t</p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs text-zinc-400">Species</p>
          <p className="mt-1 text-2xl font-bold text-white">{result.speciesLabel}</p>
          <p className="text-xs text-zinc-500">
            {result.quantity} trees · {result.co2PerTreePerYearKg} kg/tree/yr
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs text-zinc-400">≈ Driving avoided / year</p>
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
    </section>
  );
}

export default CampaignImpactCalculator;
