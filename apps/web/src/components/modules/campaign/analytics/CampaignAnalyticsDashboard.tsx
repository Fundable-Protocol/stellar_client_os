"use client";

import React, { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
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
  Mail,
  Search,
  Share2,
  TrendingUp,
  Users,
} from "lucide-react";
import { CampaignFundingVelocityChart } from "../FundingVelocityChart";

export interface CampaignAnalyticsDashboardProps {
  campaignId: string;
  campaignTitle?: string;
}

interface DashboardBenchmarkMetric {
  label: string;
  current: number;
  benchmark: number;
  unit: string;
  delta: number;
}

interface DashboardPayload {
  campaignId: string;
  updatedAt: number;
  trafficSources: Array<{
    source: string;
    label: string;
    visitors: number;
    views: number;
    share: number;
    pledges: number;
    conversionRate: number;
  }>;
  funnel: Array<{ stage: string; label: string; count: number; conversionRate: number; dropoffRate: number }>;
  pledgeFunnel?: Array<{ stage: string; label: string; count: number; conversionRate: number; dropoffRate: number }>;
  demographics: Array<{ region: string; backers: number; totalAmount: string; share: number }>;
  rewardTiers: Array<{ tierId: string; name: string; price: string; backers: number; revenue: string; share: number }>;
  dailyTrend: Array<{ date: string; amount: string; contributions: number; cumulative: string }>;
  hourlyTrend?: Array<{ hour: string; amount: string; contributions: number; cumulative: string }>;
  totals: { visitors: number; contributions: number; totalFunded: string; conversionRate: number };
  speciesDiversity: { speciesCount: number; diversityScore: number; species: string[] };
  benchmark: {
    category: string;
    anonymizedSampleSize: number;
    comparedTo: string;
    metrics: DashboardBenchmarkMetric[];
    suggestions: string[];
  };
}

const BAR_COLORS = ["#a855f7", "#8b5cf6", "#6366f1", "#10b981", "#f59e0b"];
const FUNNEL_COLORS = ["#3b82f6", "#8b5cf6", "#10b981"];

const EMPTY: DashboardPayload = {
  campaignId: "",
  updatedAt: 0,
  trafficSources: [],
  funnel: [],
  pledgeFunnel: [],
  demographics: [],
  rewardTiers: [],
  dailyTrend: [],
  hourlyTrend: [],
  totals: { visitors: 0, contributions: 0, totalFunded: "0", conversionRate: 0 },
  speciesDiversity: { speciesCount: 0, diversityScore: 0, species: [] },
  benchmark: {
    category: "General sustainability",
    anonymizedSampleSize: 0,
    comparedTo: "anonymized aggregated performance from similar campaigns in this category",
    metrics: [],
    suggestions: [],
  },
};

function getTrafficSourceIcon(source: string) {
  switch (source.toLowerCase()) {
    case "direct":
      return <Globe className="h-3.5 w-3.5 text-blue-400" />;
    case "social":
      return <Share2 className="h-3.5 w-3.5 text-pink-400" />;
    case "email":
    case "newsletter":
      return <Mail className="h-3.5 w-3.5 text-amber-400" />;
    case "search":
      return <Search className="h-3.5 w-3.5 text-emerald-400" />;
    default:
      return <Globe className="h-3.5 w-3.5 text-purple-400" />;
  }
}

export function CampaignAnalyticsDashboard({
  campaignId,
  campaignTitle = "this campaign",
}: CampaignAnalyticsDashboardProps) {
  const [result, setResult] = useState<{
    campaignId: string;
    dashboard: DashboardPayload;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/campaigns/${campaignId}/analytics/dashboard`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled) {
          setResult({ campaignId, dashboard: payload?.data ?? EMPTY });
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ campaignId, dashboard: EMPTY });
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const loading = result?.campaignId !== campaignId;
  const dashboard =
    result?.campaignId === campaignId ? result.dashboard : EMPTY;
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

  const pledgeFunnelStages =
    dashboard.pledgeFunnel && dashboard.pledgeFunnel.length > 0
      ? dashboard.pledgeFunnel
      : [
          {
            stage: "visitors",
            label: "Visitors",
            count: dashboard.totals.visitors,
            conversionRate: 100,
            dropoffRate: 0,
          },
          {
            stage: "pledge_initiated",
            label: "Pledge initiated",
            count:
              dashboard.funnel.find(
                (s) => s.stage === "contribute" || s.stage === "pledge_initiated",
              )?.count ?? 0,
            conversionRate:
              dashboard.funnel.find(
                (s) => s.stage === "contribute" || s.stage === "pledge_initiated",
              )?.conversionRate ?? 0,
            dropoffRate:
              dashboard.funnel.find(
                (s) => s.stage === "contribute" || s.stage === "pledge_initiated",
              )?.dropoffRate ?? 0,
          },
          {
            stage: "pledge_completed",
            label: "Pledge completed",
            count:
              dashboard.funnel.find(
                (s) => s.stage === "confirm" || s.stage === "pledge_completed",
              )?.count ?? dashboard.totals.contributions,
            conversionRate: dashboard.totals.conversionRate,
            dropoffRate:
              dashboard.funnel.find(
                (s) => s.stage === "confirm" || s.stage === "pledge_completed",
              )?.dropoffRate ?? 0,
          },
        ];

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
            <StatCard icon={<Globe className="h-4 w-4 text-emerald-400" />} label="Species Diversity" value={String(dashboard.speciesDiversity.diversityScore)} suffix={`${dashboard.speciesDiversity.speciesCount} spp`} />
          </div>

          <BenchmarkPanel benchmark={dashboard.benchmark} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Traffic sources breakdown by referral source */}
            <MetricPanel icon={<Globe className="h-4 w-4 text-purple-400" />} title="Traffic Sources & Conversion Rate">
              <div className="space-y-3">
                {dashboard.trafficSources.map((source) => (
                  <div key={source.source} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-medium text-zinc-200">
                        {getTrafficSourceIcon(source.source)}
                        {source.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                          {source.conversionRate}% conversion
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>{source.visitors} visitors · {source.views} views</span>
                      <span className="text-zinc-300 font-medium">{source.pledges} pledges</span>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-emerald-400"
                        style={{ width: `${Math.min(100, Math.max(source.conversionRate, 2))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </MetricPanel>

            {/* Conversion funnel chart: visitors to pledge initiated to pledge completed */}
            <MetricPanel icon={<Activity className="h-4 w-4 text-blue-400" />} title="Pledge Funnel Chart">
              <div className="space-y-4">
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <FunnelChart>
                      <Tooltip
                        contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", fontSize: 12, borderRadius: 8 }}
                        formatter={(val: unknown) => [String(val), "Count"]}
                      />
                      <Funnel
                        dataKey="value"
                        data={pledgeFunnelStages.map((stage, idx) => ({
                          name: stage.label,
                          value: stage.count,
                          fill: FUNNEL_COLORS[idx % FUNNEL_COLORS.length],
                        }))}
                        isAnimationActive={false}
                      >
                        <LabelList position="right" fill="#e4e4e7" stroke="none" dataKey="name" fontSize={11} />
                      </Funnel>
                    </FunnelChart>
                  </ResponsiveContainer>
                </div>

                {/* Step-by-step funnel stages breakdown */}
                <div className="space-y-2 border-t border-zinc-800/80 pt-3">
                  {pledgeFunnelStages.map((stage, index) => (
                    <div key={stage.stage} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 font-medium">{index + 1}. {stage.label}</span>
                        <span className="text-zinc-400">
                          <strong className="text-zinc-100">{stage.count}</strong> ({stage.conversionRate}%)
                          {stage.dropoffRate > 0 && <span className="ml-1 text-rose-400">-{stage.dropoffRate}%</span>}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500"
                          style={{ width: `${Math.min(100, stage.conversionRate)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
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

          {/* Campaign Funding Velocity Line Chart (Creator Analytics: Hourly Granularity) */}
          <CampaignFundingVelocityChart
            campaignId={campaignId}
            isCreator={true}
            variant="creator"
            granularity="hourly"
            allowGranularityToggle={true}
            dailyData={dashboard.dailyTrend.map((point) => ({
              label: point.date.slice(5),
              date: point.date,
              raised: Number(point.amount),
              contributions: point.contributions,
              cumulative: Number(point.cumulative),
            }))}
            hourlyData={dashboard.hourlyTrend?.map((point) => ({
              label: point.hour.includes("T") ? point.hour.split("T")[1] : point.hour,
              hour: point.hour,
              raised: Number(point.amount),
              contributions: point.contributions,
              cumulative: Number(point.cumulative),
            }))}
            currency="XLM"
          />

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

          {/* Tree species diversity */}
          <MetricPanel icon={<Globe className="h-4 w-4 text-emerald-400" />} title="Tree Species Diversity">
            {dashboard.speciesDiversity.speciesCount === 0 ? (
              <p className="text-xs text-zinc-500">Species data appears as trees are registered to this campaign.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300">Diversity Score</span>
                  <span className="font-semibold text-emerald-400">{dashboard.speciesDiversity.diversityScore}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {dashboard.speciesDiversity.species.map((species) => (
                    <span key={species} className="rounded-full border border-emerald-900 bg-emerald-950/60 px-3 py-1 text-[10px] font-semibold text-emerald-300">
                      {species}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </MetricPanel>
        </>
      )}
    </section>
  );
}

function BenchmarkPanel({
  benchmark,
}: {
  benchmark: DashboardPayload["benchmark"];
}) {
  return (
    <div className="rounded-xl border border-violet-900/60 bg-gradient-to-r from-violet-950/50 via-zinc-950/70 to-emerald-950/40 p-5">
      <div className="flex flex-col gap-2 border-b border-zinc-800 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">Benchmark panel</p>
          <h3 className="mt-1 text-lg font-bold text-zinc-50">Performance vs similar campaigns</h3>
        </div>
        <div className="rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-[10px] font-medium text-zinc-300">
          {benchmark.anonymizedSampleSize} anonymized campaigns in {benchmark.category}
        </div>
      </div>

      <p className="mt-3 text-xs text-zinc-300">
        Compared with {benchmark.comparedTo}. Metrics are aggregated and anonymized to protect creator privacy.
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {benchmark.metrics.map((metric) => {
          const gap = metric.delta >= 0 ? `${metric.delta}% above` : `${Math.abs(metric.delta)}% below`;
          return (
            <div key={metric.label} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
                <span>{metric.label}</span>
                <span className={metric.delta >= 0 ? "text-emerald-400" : "text-amber-400"}>{gap}</span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <div className="text-xl font-black text-zinc-50">
                    {metric.current}
                    <span className="ml-1 text-[10px] font-semibold text-zinc-400">{metric.unit}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-500">Your campaign</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-violet-300">{metric.benchmark}</div>
                  <div className="text-[10px] text-zinc-500">Benchmark</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4">
        <h4 className="text-sm font-bold text-emerald-300">Suggested actions</h4>
        <ul className="mt-3 space-y-2 text-xs text-zinc-200">
          {benchmark.suggestions.map((suggestion) => (
            <li key={suggestion} className="flex gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{suggestion}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
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