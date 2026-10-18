"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreatorRecurringRevenueReport } from "@/types/recurring-contributions";
import {
  TrendingUp,
  Users,
  Repeat,
  DollarSign,
  Download,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export interface CreatorRecurringRevenueReportViewProps {
  creatorAddress: string;
}

export const CreatorRecurringRevenueReportView: React.FC<CreatorRecurringRevenueReportViewProps> = ({
  creatorAddress,
}) => {
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, isError } = useQuery<{ report: CreatorRecurringRevenueReport }>({
    queryKey: ["creator-recurring-revenue", creatorAddress],
    queryFn: async () => {
      const res = await fetch(`/api/reports/recurring-revenue?creatorAddress=${creatorAddress}`);
      if (!res.ok) throw new Error("Failed to load recurring revenue report");
      return res.json();
    },
    enabled: !!creatorAddress,
  });

  const report = data?.report;

  const handleExportJson = () => {
    if (!report) return;
    setDownloading(true);
    try {
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(report, null, 2)
      )}`;
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", jsonString);
      downloadAnchor.setAttribute(
        "download",
        `recurring-revenue-report-${creatorAddress}-${new Date().toISOString().slice(0, 10)}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } finally {
      setDownloading(false);
    }
  };

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

  if (isError || !report) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-2 text-rose-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>Could not load creator recurring revenue report.</span>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Monthly Recurring Revenue (MRR)",
      value: `${report.totalMonthlyRecurringRevenue} ${report.token}`,
      icon: TrendingUp,
      sub: "Active subscriber volume / month",
      color: "text-emerald-400",
    },
    {
      title: "Annual Recurring Revenue (ARR)",
      value: `${report.totalAnnualRecurringRevenue} ${report.token}`,
      icon: Repeat,
      sub: "Projected 12-month run rate",
      color: "text-blue-400",
    },
    {
      title: "Active Subscribers",
      value: report.activeSubscribersCount,
      icon: Users,
      sub: `${report.pausedSubscribersCount} paused, ${report.cancelledSubscribersCount} churned`,
      color: "text-purple-400",
    },
    {
      title: "Total Recurring Volume",
      value: `${report.totalLifetimeVolume} ${report.token}`,
      icon: DollarSign,
      sub: "Lifetime processed from recurring backers",
      color: "text-amber-400",
    },
  ];

  return (
    <div
      data-testid="creator-recurring-revenue-report"
      className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-8 space-y-6"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">
              Recurring Monthly Revenue Report
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time monthly subscription insights across all your campaigns.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          data-testid="export-recurring-report-btn"
          disabled={downloading}
          onClick={handleExportJson}
          className="border-zinc-700 hover:border-zinc-600 text-zinc-300 text-xs gap-2"
        >
          <Download className="w-4 h-4" />
          Export JSON Report
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c, i) => (
          <div
            key={i}
            className="bg-zinc-800/40 border border-zinc-800/60 rounded-xl p-4 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-medium">{c.title}</span>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <div>
              <span className="text-2xl font-bold text-white tracking-tight">{c.value}</span>
              <p className="text-[11px] text-zinc-500 mt-1">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-200">Revenue by Campaign</h3>
        {report.campaigns.length === 0 ? (
          <div className="text-center py-6 text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-xl">
            No recurring backers recorded for any campaign yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-800/50 text-[11px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Active Backers</th>
                  <th className="px-4 py-3">MRR</th>
                  <th className="px-4 py-3">ARR</th>
                  <th className="px-4 py-3">Lifetime Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {report.campaigns.map((camp) => (
                  <tr key={camp.campaignId} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-medium text-white">{camp.campaignTitle}</td>
                    <td className="px-4 py-3 text-zinc-300">{camp.activeSubscribersCount}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-400">
                      {camp.monthlyRecurringRevenue} {camp.token}
                    </td>
                    <td className="px-4 py-3 text-blue-400">
                      {camp.annualRecurringRevenue} {camp.token}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {camp.totalLifetimeVolume} {camp.token}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatorRecurringRevenueReportView;
