"use client";

import React, { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BarChart3,
  Globe,
  Gift,
  TrendingUp,
  Users,
} from "lucide-react";

export interface CampaignAnalyticsDashboardProps {
  campaignId: string;
  campaignTitle?: string;
}

interface DashboardPayload {
  campaignId: string;
  updatedAt: number;
  trafficSources: Array<{ source: string; label: string; visitors: number; views: number; share: number }>;
  funnel: Array<{ stage: string; label: string; count: number; conversionRate: number; dropoffRate: number }>;
  demographics: Array<{ region: string; backers: number; totalAmount: string; share: number }>;
  rewardTiers: Array<{ tierId: string; name: string; price: string; backers: number; revenue: string; share: number }>;
  dailyTrend: Array<{ date: string; amount: string; contributions: number; cumulative: string }>;
  totals: { visitors: number; contributions: number; totalFunded: string; conversionRate: number };
}

const BAR_COLORS = ["#a855f7", "#8b5cf6", "#6366f1", "#10b981", "#f59e0b"];

const EMPTY: DashboardPayload = {
  campaignId: "",
  updatedAt: 0,
  trafficSources: [],
  funnel: [],
  demographics: [],
  rewardTiers: [],
  dailyTrend: [],
  totals: { visitors: 0, contributions: 0, totalFunded: "0", conversionRate: 0 },
};

export function CampaignAnalyticsDashboard({
  campaignId,
  campaignTitle = "this campaign",
}: CampaignAnalyticsDashboardProps) {
  const [dashboard, setDashboard] = useState<DashboardPayload>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/campaigns/${campaignId}/analytics/dashboard`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled) setDashboard(payload?.data ?? EMPTY);
      })
      .catch(() => {
        if (!cancelled) setDashboard(EMPTY);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const hasData = dashboard.totals.visitors > 0 || dashboard.totals.contributions > 0;

  if (loading) {
    return (
      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-8 text-sm text-zinc-400">
        Loading creator analytics for {campaignTitle}…
      </div>
    );
  }

  const dailyChartData = dashboard.dailyTrend.map((point) => ({
    name: point.date.slice(5),
    fundraising: Number(point.amount),
    cumulative: Number(point.cumulative),
  }));

  return (
    <section className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-md">
      {/* Header */}
      <div className="border-b border-zinc-800 pb-5">
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
          <BarChart3 className="h-5 w-5 text-emerald-400" />
          Campaign Analytics
        </h2>
        <p className="mt-1 text-xs text-zinc-400">
          Where visitors come from, how they convert, and what backers prefer — for {campaignTitle}.
        </p>
      </div>

      {!hasData ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center text-xs text-zinc-500">
          Analytics begin streaming to this dashboard as soon as visitors arrive and backers contribute.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={<Users className="h-4 w-4 text-purple-400" />} label="Visitors" value={String(dashboard.totals.visitors)} />
            <StatCard icon={<Activity className="h-4 w-4 text-blue-400" />} label="Contributions" value={String(dashboard.totals.contributions)} />
            <StatCard icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} label="Total Funded" value={dashboard.totals.totalFunded} suffix="XLM" />
            <StatCard icon={<Gift className="h-4 w-4 text-amber-400" />} label="Conversion" value={`${dashboard.totals.conversionRate}%`} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Traffic sources */}
            <MetricPanel icon={<Globe className="h-4 w-4 text-purple-400" />} title="Traffic Sources">
              <div className="space-y-3">
                {dashboard.trafficSources.map((source) => (
                  <div key={source.source} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300">{source.label}</span>
                      <span className="text-zinc-500">{source.views} views · {source.visitors} visitors</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500" style={{ width: `${Math.min(100, source.share)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </MetricPanel>

            {/* Conversion funnel */}
            <MetricPanel icon={<Activity className="h-4 w-4 text-blue-400" />} title="Conversion Funnel">
              <div className="space-y-3">
                {dashboard.funnel.map((stage, index) => (
                  <div key={stage.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300">{index + 1}. {stage.label}</span>
                      <span className="text-zinc-500">
                        {stage.count} ({stage.conversionRate}%)
                        {stage.dropoffRate > 0 && <span className="ml-1 text-rose-400">-{stage.dropoffRate}%</span>}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                        style={{ width: `${Math.min(100, stage.conversionRate)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </MetricPanel>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Reward tier popularity */}
            <MetricPanel icon={<Gift className="h-4 w-4 text-amber-400" />} title="Reward Tier Popularity">
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard.rewardTiers} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} interval={0} angle={-18} textAnchor="end" height={50} />
                    <YAxis stroke="#71717a" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", fontSize: 12 }} />
                    <Bar dataKey="backers" name="Backers" radius={[4, 4, 0, 0]}>
                      {dashboard.rewardTiers.map((tier, index) => (
                        <Cell key={tier.tierId} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </MetricPanel>

            {/* Backer demographics */}
            <MetricPanel icon={<Globe className="h-4 w-4 text-emerald-400" />} title="Backer Demographics">
              <div className="space-y-3">
                {dashboard.demographics.length === 0 && (
                  <p className="text-xs text-zinc-500">Region data appears as backers contribute.</p>
                )}
                {dashboard.demographics.map((region) => (
                  <div key={region.region} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs">
                    <span className="flex items-center gap-2 font-semibold text-zinc-200">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-950 text-[10px] font-bold text-emerald-400">
                        {region.region.slice(0, 2).toUpperCase()}
                      </span>
                      {region.region}
                    </span>
                    <span className="text-zinc-400">
                      {region.backers} backers · {region.totalAmount} XLM
                    </span>
                  </div>
                ))}
              </div>
            </MetricPanel>
          </div>

          {/* Daily funding trend */}
          <MetricPanel icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} title="Daily Funding Trend">
            {dailyChartData.length === 0 ? (
              <p className="text-xs text-zinc-500">Daily funding appears as contributions land on-chain.</p>
            ) : (
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} />
                    <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", fontSize: 12 }} />
                    <Bar dataKey="fundraising" name="Funded (XLM)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </MetricPanel>
        </>
      )}
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-black text-zinc-50">
        {value}
        {suffix && <span className="ml-1 text-xs font-semibold text-emerald-400">{suffix}</span>}
      </div>
    </div>
  );
}

function MetricPanel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-zinc-100">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

export default CampaignAnalyticsDashboard;