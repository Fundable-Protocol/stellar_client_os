"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, CircleDollarSign, Leaf, RefreshCw, Sprout, Target, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface DashboardData {
  updatedAt: number;
  currencyUnit: "stroops";
  metrics: {
    activeCampaigns: number;
    totalTreesPlanted: number;
    totalCo2SequesteredKg: number;
    totalSponsors: number;
    sponsorGrowthPercent: number;
    campaignCompletionRate: number;
    revenue: string;
  };
  monthlyTrend: Array<{ month: string; campaigns: number; sponsors: number; revenue: string }>;
}

const formatNumber = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);

function formatRevenue(value: string): string {
  return `${formatNumber(Number(value) / 10_000_000)} XLM`;
}

function MetricCard({ title, value, detail, icon: Icon, accent }: { title: string; value: string; detail: string; icon: typeof Activity; accent: string }) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl shadow-black/10">
      <div className="mb-6 flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{title}</p>
        <span className={`grid size-9 place-items-center rounded-xl bg-white/5 ${accent}`}><Icon size={18} /></span>
      </div>
      <p className="text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm text-zinc-500">{detail}</p>
    </article>
  );
}

export default function AnalyticsPage() {
  const { data, isLoading, isError, dataUpdatedAt, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ["admin-analytics-dashboard"],
    queryFn: async () => {
      const response = await fetch("/api/analytics/dashboard", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load analytics");
      return (await response.json()).data;
    },
    refetchInterval: 15_000,
  });

  if (isLoading) return <main className="p-6 text-zinc-400">Loading analytics dashboard...</main>;
  if (isError || !data) return <main className="p-6 text-rose-300">Analytics are temporarily unavailable.</main>;

  const { metrics } = data;
  const lastUpdated = new Date(dataUpdatedAt || data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const chartData = data.monthlyTrend.map((point) => ({ ...point, label: new Date(`${point.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short" }) }));

  return (
    <main className="min-h-full overflow-y-auto bg-[#101112] px-4 py-7 text-white md:px-8 lg:px-10">
      <header className="mb-8 flex flex-col justify-between gap-4 border-b border-zinc-800 pb-7 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-emerald-400"><Activity size={15} /><span className="text-xs font-bold uppercase tracking-[0.2em]">Live operations</span></div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Campaign analytics</h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">A real-time view of campaign health, environmental impact, and platform momentum.</p>
        </div>
        <button type="button" onClick={() => refetch()} className="inline-flex items-center gap-2 self-start rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-emerald-400 hover:text-white sm:self-auto" disabled={isFetching}>
          <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard title="Active campaigns" value={formatNumber(metrics.activeCampaigns)} detail="Currently accepting support" icon={Sprout} accent="text-emerald-400" />
        <MetricCard title="Trees planted" value={formatNumber(metrics.totalTreesPlanted)} detail="Across all campaigns" icon={Leaf} accent="text-lime-400" />
        <MetricCard title="CO2 sequestered" value={`${formatNumber(metrics.totalCo2SequesteredKg / 1000)} t`} detail="Projected annual impact" icon={BarChart3} accent="text-sky-400" />
        <MetricCard title="Sponsor growth" value={`${metrics.sponsorGrowthPercent >= 0 ? "+" : ""}${metrics.sponsorGrowthPercent}%`} detail="Last 30 days vs prior 30" icon={Users} accent="text-amber-400" />
        <MetricCard title="Completion rate" value={`${metrics.campaignCompletionRate}%`} detail="Campaigns reaching their goal" icon={Target} accent="text-violet-400" />
        <MetricCard title="Revenue" value={formatRevenue(metrics.revenue)} detail="All-time raised · stroops converted" icon={CircleDollarSign} accent="text-rose-400" />
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 md:p-7">
        <div className="mb-6 flex items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">Platform momentum</h2><p className="mt-1 text-sm text-zinc-500">Campaigns and sponsors by month</p></div><span className="text-xs text-zinc-600">Updated {lastUpdated}</span></div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={8}>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 10, color: "#fff" }} cursor={{ fill: "#ffffff08" }} />
              <Bar dataKey="campaigns" name="Campaigns" fill="#34d399" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sponsors" name="Sponsors" fill="#38bdf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}