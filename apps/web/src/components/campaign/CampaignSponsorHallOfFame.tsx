"use client";

import React, { useState } from "react";
import type { HallOfFameSponsor, CampaignHallOfFameSummary } from "@/services/campaign-hall-of-fame.service";

interface CampaignSponsorHallOfFameProps {
  summary: CampaignHallOfFameSummary;
}

export const CampaignSponsorHallOfFame: React.FC<CampaignSponsorHallOfFameProps> = ({ summary }) => {
  const [filterView, setFilterView] = useState<"all" | "top3" | "top10">("all");
  const sponsors = summary.topSponsors || [];

  const top3 = sponsors.slice(0, 3);
  const displayedSponsors =
    filterView === "top3"
      ? sponsors.slice(0, 3)
      : filterView === "top10"
      ? sponsors.slice(0, 10)
      : sponsors;

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "PLATINUM":
        return "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800";
      case "GOLD":
        return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700";
      case "SILVER":
        return "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
      case "BRONZE":
        return "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800";
      default:
        return "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
    }
  };

  const getPodiumGradient = (rank: number) => {
    switch (rank) {
      case 1:
        return "border-amber-400 bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent shadow-amber-500/10";
      case 2:
        return "border-slate-400 bg-gradient-to-b from-slate-400/10 via-slate-400/5 to-transparent shadow-slate-500/10";
      case 3:
        return "border-amber-700 bg-gradient-to-b from-amber-700/10 via-amber-700/5 to-transparent shadow-amber-700/10";
      default:
        return "border-zinc-200 dark:border-zinc-800";
    }
  };

  const getPodiumBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return {
          icon: "🥇",
          label: "1st Place",
          badgeBg: "bg-amber-500 text-black font-bold",
        };
      case 2:
        return {
          icon: "🥈",
          label: "2nd Place",
          badgeBg: "bg-slate-300 text-zinc-900 font-bold dark:bg-slate-200",
        };
      case 3:
        return {
          icon: "🥉",
          label: "3rd Place",
          badgeBg: "bg-amber-700 text-white font-bold",
        };
      default:
        return {
          icon: "🌿",
          label: `#${rank}`,
          badgeBg: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
        };
    }
  };

  return (
    <section
      id="campaign-sponsor-hall-of-fame"
      className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-all dark:border-zinc-800 dark:bg-zinc-950 sm:p-8"
      aria-label="Campaign Sponsor Hall of Fame"
    >
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-xl text-amber-500">
              🏆
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Leaderboard
            </span>
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
            Sponsor Hall of Fame
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Honoring our top contributors making direct ecological impact for this campaign.
          </p>
        </div>

        {/* Filter View Selector */}
        <div className="flex items-center rounded-lg border border-zinc-200 p-1 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilterView("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterView === "all"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            All Top Sponsors
          </button>
          <button
            type="button"
            onClick={() => setFilterView("top10")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterView === "top10"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            Top 10
          </button>
          <button
            type="button"
            onClick={() => setFilterView("top3")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filterView === "top3"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            Podium Only
          </button>
        </div>
      </div>

      {/* Top 3 Podium Cards */}
      {top3.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {top3.map((sponsor) => {
            const podium = getPodiumBadge(sponsor.rank);
            return (
              <div
                key={`podium-${sponsor.id}`}
                className={`relative flex flex-col justify-between rounded-xl border p-5 shadow-md transition-all hover:scale-[1.01] ${getPodiumGradient(
                  sponsor.rank
                )}`}
              >
                {/* Rank Badge Tag */}
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${podium.badgeBg}`}
                  >
                    <span>{podium.icon}</span>
                    <span>{podium.label}</span>
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${getTierColor(
                      sponsor.tier
                    )}`}
                  >
                    {sponsor.tier}
                  </span>
                </div>

                {/* Avatar & Identity */}
                <div className="mt-4 flex items-center gap-3">
                  <img
                    src={sponsor.avatarUrl}
                    alt={sponsor.name}
                    className="h-12 w-12 rounded-full border-2 border-white object-cover shadow-sm dark:border-zinc-800"
                    onError={(e) => {
                      // Fallback avatar
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-zinc-900 dark:text-white">
                      {sponsor.name}
                    </p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                      {sponsor.formattedAddress}
                    </p>
                  </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-zinc-200/60 pt-4 dark:border-zinc-800/60">
                  <div className="rounded-lg bg-zinc-50/80 p-2.5 dark:bg-zinc-900/60">
                    <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      Trees Sponsored
                    </p>
                    <p className="mt-1 text-base font-bold text-emerald-600 dark:text-emerald-400">
                      🌳 {sponsor.treesSponsored.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg bg-zinc-50/80 p-2.5 dark:bg-zinc-900/60">
                    <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      CO₂ Offset
                    </p>
                    <p className="mt-1 text-base font-bold text-teal-600 dark:text-teal-400">
                      🌿 {sponsor.co2OffsetTonnes} t
                    </p>
                  </div>
                </div>

                {/* % of Funding Progress */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-600 dark:text-zinc-400">
                      Funding Contribution
                    </span>
                    <span className="font-bold text-fundable-purple-2">
                      {sponsor.fundingPercentageFormatted}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-fundable-purple-2 to-emerald-500 transition-all duration-500"
                      style={{ width: `${Math.min(sponsor.fundingPercentage, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
                    {sponsor.amountFormatted} {sponsor.token}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detailed Leaderboard Table */}
      <div className="mt-8 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-100/70 text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-4 py-3.5 sm:px-6">
                  Rank
                </th>
                <th scope="col" className="px-4 py-3.5 sm:px-6">
                  Sponsor
                </th>
                <th scope="col" className="px-4 py-3.5 text-right sm:px-6">
                  Trees Sponsored
                </th>
                <th scope="col" className="px-4 py-3.5 text-right sm:px-6">
                  CO₂ Offset
                </th>
                <th scope="col" className="px-4 py-3.5 text-right sm:px-6">
                  % of Campaign Funding
                </th>
                <th scope="col" className="px-4 py-3.5 text-right sm:px-6">
                  Total Contributed
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {displayedSponsors.map((sponsor) => (
                <tr
                  key={sponsor.id}
                  className="transition-colors hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40"
                >
                  {/* Rank */}
                  <td className="whitespace-nowrap px-4 py-4 sm:px-6 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      {sponsor.rank === 1 && "🥇"}
                      {sponsor.rank === 2 && "🥈"}
                      {sponsor.rank === 3 && "🥉"}
                      <span className="text-zinc-900 dark:text-white">#{sponsor.rank}</span>
                    </span>
                  </td>

                  {/* Sponsor Identity */}
                  <td className="whitespace-nowrap px-4 py-4 sm:px-6">
                    <div className="flex items-center gap-3">
                      <img
                        src={sponsor.avatarUrl}
                        alt={sponsor.name}
                        className="h-9 w-9 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-950 dark:text-white">
                            {sponsor.name}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getTierColor(
                              sponsor.tier
                            )}`}
                          >
                            {sponsor.tier}
                          </span>
                        </div>
                        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          {sponsor.formattedAddress}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Trees Sponsored */}
                  <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-emerald-700 dark:text-emerald-400 sm:px-6">
                    🌳 {sponsor.treesSponsored.toLocaleString()} trees
                  </td>

                  {/* CO2 Offset */}
                  <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-teal-700 dark:text-teal-400 sm:px-6">
                    🌿 {sponsor.co2OffsetTonnes} t CO₂
                    <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                      ({sponsor.co2OffsetKg.toLocaleString()} kg)
                    </span>
                  </td>

                  {/* % of Funding with mini bar */}
                  <td className="whitespace-nowrap px-4 py-4 text-right sm:px-6">
                    <div className="inline-flex flex-col items-end">
                      <span className="font-bold text-fundable-purple-2">
                        {sponsor.fundingPercentageFormatted}
                      </span>
                      <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-fundable-purple-2"
                          style={{ width: `${Math.min(sponsor.fundingPercentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Total Contributed */}
                  <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-zinc-900 dark:text-white sm:px-6">
                    {sponsor.amountFormatted} {sponsor.token}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default CampaignSponsorHallOfFame;
