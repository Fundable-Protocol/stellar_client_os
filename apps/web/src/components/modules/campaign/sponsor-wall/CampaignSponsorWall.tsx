"use client";

import React from "react";
import { Search, Radio, Award, Heart, TrendingUp, Users, Sparkles, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSponsorWall } from "@/hooks/use-sponsor-wall";
import { SponsorCard } from "./SponsorCard";
import { SponsorTier } from "@/types/sponsor";
import { cn } from "@/lib/utils";

export interface CampaignSponsorWallProps {
  campaignId: string;
  campaignTitle?: string;
}

const TIER_FILTERS: { label: string; value: SponsorTier | "ALL" }[] = [
  { label: "All Tiers", value: "ALL" },
  { label: "Platinum", value: "PLATINUM" },
  { label: "Gold", value: "GOLD" },
  { label: "Silver", value: "SILVER" },
  { label: "Bronze", value: "BRONZE" },
];

export function CampaignSponsorWall({ campaignId, campaignTitle = "Save the Amazon RainForest" }: CampaignSponsorWallProps) {
  const wall = useSponsorWall({ campaignId, enableLiveUpdates: true });

  return (
    <section className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-md">
      {/* Header with Live Indicator */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-zinc-50 flex items-center gap-2">
              <Heart className="h-5 w-5 text-rose-500 fill-rose-500/20" />
              Sponsor Wall
            </h2>
            <button
              onClick={() => wall.setIsLiveActive(!wall.isLiveActive)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all",
                wall.isLiveActive
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/20"
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700"
              )}
              title="Toggle simulated real-time live sponsorship updates"
            >
              <Radio className={cn("h-3.5 w-3.5", wall.isLiveActive && "animate-pulse text-emerald-400")} />
              {wall.isLiveActive ? "LIVE UPDATING" : "PAUSED"}
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Real-time wall of backer sponsorships and community supporters for {campaignTitle}.
          </p>
        </div>

        {/* Stats banner */}
        <div className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-400" />
            <div>
              <span className="text-zinc-400 block text-[10px]">Sponsors</span>
              <strong className="text-zinc-100 font-bold text-sm">{wall.stats.totalSponsors}</strong>
            </div>
          </div>
          <div className="h-6 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <div>
              <span className="text-zinc-400 block text-[10px]">Total Raised</span>
              <strong className="text-zinc-100 font-bold text-sm">{wall.stats.totalRaised.toLocaleString()} XLM</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search sponsor name or Stellar address..."
            value={wall.searchQuery}
            onChange={(e) => wall.setSearchQuery(e.target.value)}
            className="pl-9 border-zinc-700 bg-zinc-900 text-xs text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Tier Buttons */}
          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
            {TIER_FILTERS.map((tf) => (
              <button
                key={tf.value}
                onClick={() => wall.setSelectedTier(tf.value)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                  wall.selectedTier === tf.value
                    ? "bg-purple-600 text-white font-semibold"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Sort By Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => wall.setSortBy(wall.sortBy === "RECENT" ? "AMOUNT" : "RECENT")}
            className="border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <Filter className="mr-1.5 h-3.5 w-3.5 text-zinc-400" />
            Sort: {wall.sortBy === "RECENT" ? "Most Recent" : "Highest Amount"}
          </Button>
        </div>
      </div>

      {/* Sponsor Grid */}
      {wall.sponsors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-xs text-zinc-500">
          No sponsors match the current filter or search criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wall.sponsors.map((sponsor) => (
            <SponsorCard key={sponsor.id} sponsor={sponsor} />
          ))}
        </div>
      )}
    </section>
  );
}

export default CampaignSponsorWall;
