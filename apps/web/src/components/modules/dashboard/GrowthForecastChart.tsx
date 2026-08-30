import React, { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const SPECIES_GROWTH: Record<string, { maxKg: number; rate: number }> = {
  Teak: { maxKg: 120, rate: 0.18 },
  Moringa: { maxKg: 90, rate: 0.22 },
  Eucalyptus: { maxKg: 150, rate: 0.2 },
  Mangrove: { maxKg: 110, rate: 0.16 },
  default: { maxKg: 100, rate: 0.18 },
};

export interface GrowthForecastChartProps {
  species: string;
  ageYears: number;
  horizonYears?: number;
}

export function growthForecast(species: string, ageYears: number, horizonYears = 10) {
  const curve = SPECIES_GROWTH[species] ?? SPECIES_GROWTH.default;
  const age = Math.max(0, ageYears);
  return Array.from({ length: horizonYears + 1 }, (_, offset) => {
    const year = Math.round((age + offset) * 10) / 10;
    const biomassKg = curve.maxKg * (1 - Math.exp(-curve.rate * year));
    return { year, biomassKg: Math.round(biomassKg * 10) / 10 };
  });
}

export function GrowthForecastChart({ species, ageYears, horizonYears = 10 }: GrowthForecastChartProps) {
  const data = useMemo(() => growthForecast(species, ageYears, horizonYears), [species, ageYears, horizonYears]);
  return (
    <section aria-labelledby="growth-forecast-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 mb-8">
      <div className="mb-4"><h3 id="growth-forecast-heading" className="text-lg font-semibold text-white">AI-assisted growth forecast</h3><p className="text-sm text-zinc-400">Projected biomass curve for {species}, based on species and tree age.</p></div>
      <div className="h-[280px] w-full" data-testid="growth-forecast-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs><linearGradient id="growthForecast" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.75} /><stop offset="95%" stopColor="#10b981" stopOpacity={0.05} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="year" stroke="#71717a" fontSize={12} tickLine={false} /><YAxis dataKey="biomassKg" stroke="#71717a" fontSize={12} tickLine={false} unit=" kg" />
            <Tooltip formatter={(value: number) => [`${value} kg`, "Projected biomass"]} labelFormatter={(value) => `Tree age: ${value} years`} contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a" }} />
            <Area type="monotone" dataKey="biomassKg" stroke="#10b981" fill="url(#growthForecast)" fillOpacity={1} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs text-zinc-500">Forecasts are estimates, not guarantees; field verification remains the source of truth.</p>
    </section>
  );
}

export default GrowthForecastChart;
