"use client";

import React from "react";
import { useWallet } from "@/providers/StellarWalletProvider";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { CreatorStats } from "@/services/creator-stats.service";
import { TrendingUp, Trees, Users, DollarSign, Award, CheckCircle2 } from "lucide-react";

export const CreatorStatsDashboard: React.FC = () => {
  const { address } = useWallet();
  const effectiveAddress = address || "GBREAKER1";

  const { data: stats, isLoading, isError } = useQuery<CreatorStats>({
    queryKey: ["creator-stats", effectiveAddress],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/creator-stats?creator=${effectiveAddress}`);
      if (!res.ok) throw new Error("Failed to load creator stats");
      const json = await res.json();
      return json.data;
    },
    enabled: !!effectiveAddress,
  });

  if (isLoading) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-8 space-y-6">
        <Skeleton className="h-7 w-64 bg-zinc-800" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl bg-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return null;
  }

  const statCards = [
    {
      title: "Total Raised",
      value: stats.totalRaisedUsd,
      subtext: `${stats.totalRaisedStroops} stroops`,
      icon: DollarSign,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10 border-emerald-500/20",
    },
    {
      title: "Trees Planted",
      value: stats.totalTreesPlanted.toLocaleString(),
      subtext: `~${stats.totalCo2OffsetKg.toLocaleString()} kg CO₂ offset/yr`,
      icon: Trees,
      color: "text-green-400",
      bgColor: "bg-green-500/10 border-green-500/20",
    },
    {
      title: "Campaign Sponsors",
      value: stats.totalSponsors.toString(),
      subtext: "Unique wallet backers",
      icon: Users,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10 border-blue-500/20",
    },
    {
      title: "Revenue Share Earned",
      value: stats.revenueShareEarnedUsd,
      subtext: "Net proceeds after fees",
      icon: Award,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10 border-purple-500/20",
    },
  ];

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-8" data-testid="creator-stats-dashboard">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-2">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Campaign Creator Dashboard
          </h2>
          <p className="text-sm text-zinc-400">
            Real-time aggregate performance metrics across all your created campaigns
          </p>
        </div>
        <div className="flex items-center gap-2 bg-zinc-800/80 px-3 py-1.5 rounded-full border border-zinc-700/50 text-xs text-zinc-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Success Rate: <strong className="text-white">{stats.successRate}%</strong></span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className={`p-5 rounded-xl border ${card.bgColor} transition-all duration-200 hover:scale-[1.02]`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-400">{card.title}</span>
                <div className={`p-2 rounded-lg bg-zinc-900/80 ${card.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-white mb-1">{card.value}</div>
              <div className="text-xs text-zinc-400 truncate">{card.subtext}</div>
            </div>
          );
        })}
      </div>

      {/* Detailed Campaign Summary Table */}
      {stats.campaigns.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Your Campaigns Breakdown</h3>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-800/60 text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Campaign ID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Total Raised</th>
                  <th className="px-4 py-3">Sponsors</th>
                  <th className="px-4 py-3">Trees Planted</th>
                  <th className="px-4 py-3">Creator Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 bg-zinc-900/30">
                {stats.campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-mono font-medium text-white">#{c.id}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                        c.status === "Active"
                          ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          : c.status === "Successful" || c.status === "Claimed"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {(Number(c.totalRaised) / 10000000).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </td>
                    <td className="px-4 py-3">{c.sponsorsCount}</td>
                    <td className="px-4 py-3 text-green-400 font-medium">{c.treesPlanted} trees</td>
                    <td className="px-4 py-3 text-purple-300 font-medium">
                      {(Number(c.revenueEarned) / 10000000).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreatorStatsDashboard;
