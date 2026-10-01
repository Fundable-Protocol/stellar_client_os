"use client";

import React, { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface FundingVelocityPoint {
  label: string;
  raised: number;
}

export interface CampaignFundingVelocityChartProps {
  data?: FundingVelocityPoint[];
  currency?: string;
}

const defaultData: FundingVelocityPoint[] = [
  { label: "Mon", raised: 3200 },
  { label: "Tue", raised: 3900 },
  { label: "Wed", raised: 4300 },
  { label: "Thu", raised: 5400 },
  { label: "Fri", raised: 7200 },
  { label: "Sat", raised: 8300 },
  { label: "Sun", raised: 9600 },
];

const formatCurrency = (value: number, currency = "XLM") => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k ${currency}`;
  }

  return `${value.toLocaleString()} ${currency}`;
};

export function CampaignFundingVelocityChart({
  data = defaultData,
  currency = "XLM",
}: CampaignFundingVelocityChartProps) {
  const trend = useMemo(() => {
    const recent = data.at(-1)?.raised ?? 0;
    const previous = data.at(-2)?.raised ?? recent;
    const delta = recent - previous;
    const denominator = previous === 0 ? 1 : previous;
    const changePct = ((delta / denominator) * 100);

    return {
      recent,
      previous,
      delta,
      changePct,
      direction: delta >= 0 ? "up" : "down",
      label: delta >= 0 ? "Trending up" : "Trending down",
    };
  }, [data]);

  const weeklyTotal = data.reduce((sum, point) => sum + point.raised, 0);
  const averageRaised = weeklyTotal / Math.max(data.length, 1);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Funding velocity</p>
          <h4 className="mt-1 text-lg font-bold text-zinc-50">{formatCurrency(weeklyTotal, currency)}</h4>
        </div>

        <div
          className={[
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
            trend.direction === "up"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300",
          ].join(" ")}
        >
          {trend.direction === "up" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {trend.label}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 text-xs text-zinc-400">
        <div>
          <span className="text-zinc-500">This week</span>
          <div className="mt-1 text-sm font-semibold text-zinc-200">{formatCurrency(averageRaised, currency)}/day</div>
        </div>
        <div className="text-right">
          <span className="text-zinc-500">vs. last period</span>
          <div className={[
            "mt-1 text-sm font-semibold",
            trend.direction === "up" ? "text-emerald-300" : "text-rose-300",
          ].join(" ")}>
            {trend.direction === "up" ? "+" : "-"}
            {Math.abs(trend.changePct).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="fundingVelocityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={46}
              tickFormatter={(value) => `${Math.round(value / 1000)}k`}
            />
            <Tooltip
              formatter={(value: number) => [`${Number(value).toLocaleString()} ${currency}`, "Raised"]}
              labelFormatter={(label) => `Day: ${label}`}
              contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: 12 }}
              itemStyle={{ color: "#f4f4f5" }}
            />
            <Area
              type="monotone"
              dataKey="raised"
              stroke="#34d399"
              strokeWidth={3}
              fill="url(#fundingVelocityGradient)"
              activeDot={{ r: 5, fill: "#86efac", stroke: "#052e16", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default CampaignFundingVelocityChart;
