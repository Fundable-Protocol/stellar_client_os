"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, Clock, Calendar } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface FundingVelocityPoint {
  label?: string;
  day?: string;
  date?: string;
  hour?: string;
  timestamp?: number | string;
  raised: number;
  pledged?: number;
  contributions?: number;
  cumulative?: number;
}

export type VelocityGranularity = "daily" | "hourly";

export interface CampaignFundingVelocityChartProps {
  data?: FundingVelocityPoint[];
  dailyData?: FundingVelocityPoint[];
  hourlyData?: FundingVelocityPoint[];
  currency?: string;
  campaignId?: string;
  startDate?: string | number;
  endDate?: string | number;
  granularity?: VelocityGranularity;
  allowGranularityToggle?: boolean;
  variant?: "backer" | "creator";
  isCreator?: boolean;
  title?: string;
  className?: string;
  ariaLabel?: string;
}

export const defaultWeeklyData: FundingVelocityPoint[] = [
  { day: "Mon", label: "Mon", raised: 3200, contributions: 8 },
  { day: "Tue", label: "Tue", raised: 3900, contributions: 11 },
  { day: "Wed", label: "Wed", raised: 4300, contributions: 12 },
  { day: "Thu", label: "Thu", raised: 5400, contributions: 15 },
  { day: "Fri", label: "Fri", raised: 7200, contributions: 21 },
  { day: "Sat", label: "Sat", raised: 8300, contributions: 24 },
  { day: "Sun", label: "Sun", raised: 9600, contributions: 29 },
];

export function generateCampaignLifetimeData(
  startDateStr = "2026-08-01",
  endDateStr = "2026-10-31",
  totalTarget = 33850
): FundingVelocityPoint[] {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const now = new Date("2026-10-17");
  const effectiveEnd = isNaN(end.getTime()) || end < now ? (isNaN(end.getTime()) ? now : end) : now;
  const daysDiff = Math.max(7, Math.min(90, Math.round((effectiveEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))));

  const points: FundingVelocityPoint[] = [];
  let runningCumulative = 0;

  for (let i = 0; i < daysDiff; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const monthDay = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const progress = i / (daysDiff - 1);
    const wave = Math.sin(progress * Math.PI * 4) * 0.25 + 1;
    const momentum = (1 + Math.exp(-progress * 3) + Math.exp((progress - 1) * 3)) * wave;
    const dailyBase = Math.round((totalTarget / daysDiff) * (momentum / 1.5));
    const dailyAmount = Math.max(150, dailyBase);

    runningCumulative += dailyAmount;
    points.push({
      date: dateStr,
      label: monthDay,
      raised: dailyAmount,
      pledged: dailyAmount,
      contributions: Math.max(1, Math.round(dailyAmount / 160)),
      cumulative: runningCumulative,
    });
  }

  return points;
}

export function generateHourlyVelocityData(total24h = 4200): FundingVelocityPoint[] {
  const points: FundingVelocityPoint[] = [];
  let runningCumulative = 0;

  for (let hour = 0; hour < 24; hour++) {
    const hourLabel = `${hour.toString().padStart(2, "0")}:00`;
    const peakFactor = Math.sin(((hour - 6) / 24) * Math.PI * 2) * 0.45 + 0.85;
    const hourlyAmount = Math.max(25, Math.round((total24h / 24) * peakFactor));
    runningCumulative += hourlyAmount;

    points.push({
      hour: hourLabel,
      label: hourLabel,
      raised: hourlyAmount,
      pledged: hourlyAmount,
      contributions: Math.max(1, Math.round(hourlyAmount / 80)),
      cumulative: runningCumulative,
    });
  }

  return points;
}

const formatCurrency = (value: number, currency = "XLM") => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k ${currency}`;
  }

  return `${value.toLocaleString()} ${currency}`;
};

export function CampaignFundingVelocityChart({
  data,
  dailyData,
  hourlyData,
  currency = "XLM",
  campaignId: _campaignId,
  startDate,
  endDate,
  granularity,
  allowGranularityToggle,
  variant,
  isCreator = false,
  title = "Funding velocity",
  className = "",
  ariaLabel,
}: CampaignFundingVelocityChartProps) {
  const initialGranularity = granularity ?? (isCreator || variant === "creator" ? "hourly" : "daily");
  const [currentGranularity, setCurrentGranularity] = useState<VelocityGranularity>(initialGranularity);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (granularity) {
      setCurrentGranularity(granularity);
    }
  }, [granularity]);

  const chartData = useMemo(() => {
    let source: FundingVelocityPoint[] | undefined;

    if (currentGranularity === "hourly") {
      source = hourlyData && hourlyData.length > 0
        ? hourlyData
        : data && data.length > 0 && granularity === "hourly"
          ? data
          : generateHourlyVelocityData();
    } else {
      source = dailyData && dailyData.length > 0
        ? dailyData
        : data && data.length > 0
          ? data
          : startDate
            ? generateCampaignLifetimeData(String(startDate), endDate ? String(endDate) : undefined)
            : defaultWeeklyData;
    }

    return source.map((pt, index) => {
      const label = pt.label || pt.day || pt.date || pt.hour || `Point ${index + 1}`;
      const raised = Number(pt.raised ?? pt.pledged ?? 0);
      return {
        ...pt,
        label,
        raised,
        contributions: pt.contributions ?? 1,
      };
    });
  }, [currentGranularity, dailyData, hourlyData, data, granularity, startDate, endDate]);

  const trend = useMemo(() => {
    if (chartData.length === 0) {
      return {
        recent: 0,
        previous: 0,
        delta: 0,
        changePct: 0,
        direction: "up",
        label: "Trending up",
      };
    }

    const recent = chartData.at(-1)?.raised ?? 0;
    const previous = chartData.at(-2)?.raised ?? recent;
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
  }, [chartData]);

  const totalPeriod = chartData.reduce((sum, point) => sum + point.raised, 0);
  const averageRaised = totalPeriod / Math.max(chartData.length, 1);
  const isWeekly = chartData.length <= 7 && chartData.some((p) =>
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(p.label)
  );

  const canToggle = allowGranularityToggle ?? (isCreator || variant === "creator");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (chartData.length === 0) return;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev === null ? 0 : Math.min(prev + 1, chartData.length - 1)));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev === null ? 0 : Math.max(prev - 1, 0)));
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusedIndex(chartData.length - 1);
    } else if (e.key === "Escape") {
      setFocusedIndex(null);
    }
  };

  const periodDescription = currentGranularity === "hourly"
    ? "Past 24 hours"
    : isWeekly
      ? "This week"
      : "Campaign lifetime";

  const focusedPoint = focusedIndex !== null ? chartData[focusedIndex] : null;

  return (
    <div
      role="region"
      aria-label={ariaLabel || `Campaign funding velocity line chart (${currentGranularity} view)`}
      aria-roledescription="line chart"
      aria-describedby="velocity-chart-instructions"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        if (focusedIndex === null && chartData.length > 0) {
          setFocusedIndex(0);
        }
      }}
      onBlur={() => setFocusedIndex(null)}
      className={[
        "relative rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
        className,
      ].join(" ")}
    >
      {/* Screen reader only instructions */}
      <p id="velocity-chart-instructions" className="sr-only">
        Interactive line chart showing {currentGranularity} XLM pledged over time.
        Use Left Arrow and Right Arrow keys to navigate data points, Home to jump to the first point,
        and End to jump to the last point.
      </p>

      {/* Screen reader live announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {focusedPoint ? (
          `Data point ${focusedIndex! + 1} of ${chartData.length}: ${focusedPoint.label}, ${formatCurrency(
            focusedPoint.raised,
            currency
          )} pledged${focusedPoint.contributions ? `, ${focusedPoint.contributions} contributions` : ""}.`
        ) : (
          `Funding velocity line chart with ${chartData.length} data points. Total raised: ${formatCurrency(
            totalPeriod,
            currency
          )}. ${trend.label}.`
        )}
      </div>

      {/* Visually hidden data table for screen readers */}
      <table className="sr-only">
        <caption>
          Campaign funding velocity: {currentGranularity} pledges over {periodDescription}
        </caption>
        <thead>
          <tr>
            <th scope="col">{currentGranularity === "hourly" ? "Hour" : "Date"}</th>
            <th scope="col">Amount Pledged</th>
            <th scope="col">Contributions</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((pt, idx) => (
            <tr key={idx}>
              <td>{pt.label}</td>
              <td>{formatCurrency(pt.raised, currency)}</td>
              <td>{pt.contributions ?? 1}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{title}</p>
            {isCreator && (
              <span className="rounded bg-purple-950/70 border border-purple-800/50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-300">
                Creator analytics
              </span>
            )}
          </div>
          <h4 className="mt-1 text-lg font-bold text-zinc-50">{formatCurrency(totalPeriod, currency)}</h4>
        </div>

        <div className="flex items-center gap-2">
          {canToggle && (
            <div
              className="inline-flex items-center rounded-lg border border-zinc-800 bg-zinc-950 p-0.5"
              role="tablist"
              aria-label="Granularity switch"
            >
              <button
                type="button"
                role="tab"
                aria-selected={currentGranularity === "daily"}
                onClick={() => {
                  setCurrentGranularity("daily");
                  setFocusedIndex(null);
                }}
                className={[
                  "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  currentGranularity === "daily"
                    ? "bg-zinc-800 text-emerald-400 font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200",
                ].join(" ")}
              >
                <Calendar className="h-3 w-3" />
                Daily
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={currentGranularity === "hourly"}
                onClick={() => {
                  setCurrentGranularity("hourly");
                  setFocusedIndex(null);
                }}
                className={[
                  "inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  currentGranularity === "hourly"
                    ? "bg-zinc-800 text-emerald-400 font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200",
                ].join(" ")}
              >
                <Clock className="h-3 w-3" />
                Hourly
              </button>
            </div>
          )}

          <div
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
              trend.direction === "up"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/30 bg-rose-500/10 text-rose-300",
            ].join(" ")}
          >
            {trend.direction === "up" ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {trend.label}
          </div>
        </div>
      </div>

      {/* Submetrics */}
      <div className="flex items-end justify-between gap-3 text-xs text-zinc-400">
        <div>
          <span className="text-zinc-500">{periodDescription}</span>
          <div className="mt-1 text-sm font-semibold text-zinc-200">
            {formatCurrency(averageRaised, currency)}/{currentGranularity === "hourly" ? "hr" : "day"}
          </div>
        </div>
        <div className="text-right">
          <span className="text-zinc-500">vs. last period</span>
          <div
            className={[
              "mt-1 text-sm font-semibold",
              trend.direction === "up" ? "text-emerald-300" : "text-rose-300",
            ].join(" ")}
          >
            {trend.direction === "up" ? "+" : "-"}
            {Math.abs(trend.changePct).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Active keyboard navigation badge */}
      {focusedPoint && (
        <div
          data-testid="keyboard-focused-point"
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-1.5 text-xs flex items-center justify-between"
        >
          <span className="text-zinc-300">
            Point {focusedIndex! + 1} of {chartData.length} ({focusedPoint.label}):
          </span>
          <span className="font-semibold text-emerald-300">
            {formatCurrency(focusedPoint.raised, currency)} pledged
            {focusedPoint.contributions ? ` · ${focusedPoint.contributions} contributions` : ""}
          </span>
        </div>
      )}

      {/* Line Chart */}
      <div className="h-44 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              interval={chartData.length > 14 ? Math.floor(chartData.length / 6) : 0}
            />
            <YAxis
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={46}
              tickFormatter={(value) => `${Math.round(value / 1000)}k`}
            />
            <Tooltip
              formatter={(value: number) => [`${Number(value).toLocaleString()} ${currency}`, "Pledged"]}
              labelFormatter={(label) => `${currentGranularity === "hourly" ? "Hour" : "Date"}: ${label}`}
              contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: 12 }}
              itemStyle={{ color: "#f4f4f5" }}
            />
            <Line
              type="monotone"
              dataKey="raised"
              name="Pledged"
              stroke="#34d399"
              strokeWidth={3}
              dot={chartData.length <= 14 ? { r: 3, fill: "#34d399" } : false}
              activeDot={{ r: 6, fill: "#86efac", stroke: "#052e16", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default CampaignFundingVelocityChart;
