"use client";

import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface OverviewDataPoint {
  name: string;
  value: number;
  [key: string]: unknown;
}

export interface DashboardOverviewProps {
  data?: OverviewDataPoint[];
  title?: string;
  description?: string;
}

/**
 * Normalizes dataset to prevent Recharts rendering errors on single-point series.
 * If data contains only one entry, a dummy padding entry is added.
 */
export const processChartData = (data: OverviewDataPoint[] = []): OverviewDataPoint[] => {
  if (!data || data.length === 0) return [];
  if (data.length === 1) {
    const single = data[0];
    return [
      { ...single, name: `${single.name} `, isPadding: true },
      { ...single },
    ];
  }
  return data;
};

const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  data = [
    { name: "Jan", value: 400 },
    { name: "Feb", value: 300 },
    { name: "Mar", value: 600 },
    { name: "Apr", value: 800 },
    { name: "May", value: 500 },
  ],
  title = "Overview",
  description = "Transaction and volume trends over time",
}) => {
  const isSinglePoint = data?.length === 1;
  const chartData = useMemo(() => processChartData(data), [data]);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-8">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {description && <p className="text-sm text-zinc-400">{description}</p>}
      </div>
      <div className="h-[300px] w-full" data-testid="dashboard-overview-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorOverview" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} />
            <YAxis stroke="#71717a" fontSize={12} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "0.5rem" }}
              itemStyle={{ color: "#f4f4f5" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              fillOpacity={1}
              fill="url(#colorOverview)"
              dot={isSinglePoint ? { r: 5, fill: "#3b82f6", stroke: "#ffffff", strokeWidth: 2 } : false}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DashboardOverview;
