"use client";

import React, { useMemo } from "react";
import { Crown, Leaf, Medal, Trophy, Trees } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatTruncatedAddress, INITIAL_MOCK_SPONSORS } from "@/types/sponsor";
import { HALL_OF_FAME_LIMIT } from "@/types/campaign-hall-of-fame";
import { buildHallOfFame, getDemoHallOfFame } from "@/services/campaign-hall-of-fame.service";

export interface SponsorHallOfFameProps {
  campaignId: string;
  campaignTitle?: string;
  raisedAmount?: string;
  treeCount?: number;
  limit?: number;
}

const RANK_STYLES: Record<number, string> = {
  1: "border-amber-500/60 bg-amber-500/15 text-amber-300",
  2: "border-zinc-400/50 bg-zinc-400/10 text-zinc-200",
  3: "border-orange-700/60 bg-orange-800/20 text-orange-300",
};

function formatKg(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} t`;
  return `${Math.round(value)} kg`;
}

/**
 * Campaign sponsor Hall of Fame — rank, trees, CO2, funding share (#972).
 */
export function SponsorHallOfFame({
  campaignId,
  campaignTitle,
  raisedAmount,
  treeCount,
  limit = HALL_OF_FAME_LIMIT,
}: SponsorHallOfFameProps) {
  const board = useMemo(() => {
    if (raisedAmount !== undefined && treeCount !== undefined) {
      const sponsors = INITIAL_MOCK_SPONSORS.filter(
        (sponsor) => sponsor.campaignId === campaignId || campaignId === "demo" || campaignId === "camp-101",
      );
      return buildHallOfFame({
        campaignId,
        campaignTitle,
        raisedAmount,
        treeCount,
        sponsors,
        limit,
      });
    }
    return getDemoHallOfFame(campaignId, limit, INITIAL_MOCK_SPONSORS);
  }, [campaignId, campaignTitle, raisedAmount, treeCount, limit]);

  return (
    <section className="space-y-4 rounded-xl border border-amber-900/40 bg-gradient-to-br from-amber-950/30 via-zinc-900 to-zinc-900 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-100">
            <Trophy className="h-5 w-5 text-amber-400" />
            Sponsor Hall of Fame
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            {campaignTitle ? `${campaignTitle} · ` : ""}Top contributors by trees, CO2 offset, and funding share.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-zinc-700 text-[11px] text-zinc-300">
            {board.sponsorCount} sponsors
          </Badge>
          <Badge variant="outline" className="border-emerald-700/50 text-[11px] text-emerald-300">
            <Trees className="mr-1 h-3 w-3" /> {board.totalTrees.toLocaleString()} trees
          </Badge>
        </div>
      </div>

      {board.sponsors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-8 text-center text-sm text-zinc-400">
          No sponsors yet. The hall of fame fills as contributions arrive.
        </div>
      ) : (
        <ol className="space-y-2" aria-label="Sponsor hall of fame">
          {board.sponsors.map((sponsor) => (
            <li
              key={`${sponsor.rank}-${sponsor.address}`}
              data-testid={`hall-of-fame-row-${sponsor.rank}`}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-3"
            >
              <span
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${RANK_STYLES[sponsor.rank] ?? "border-zinc-700 text-zinc-400"}`}
              >
                {sponsor.rank === 1 ? <Crown className="h-4 w-4" /> : sponsor.rank <= 3 ? <Medal className="h-4 w-4" /> : sponsor.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-100">
                  {sponsor.name || formatTruncatedAddress(sponsor.address)}
                </p>
                <p className="truncate font-mono text-[11px] text-zinc-500">{sponsor.address}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-right text-[11px]">
                <div>
                  <p className="text-zinc-500">Trees</p>
                  <p className="font-bold text-emerald-300">{sponsor.treesSponsored.toLocaleString()}</p>
                </div>
                <div>
                  <p className="flex items-center justify-end gap-1 text-zinc-500">
                    <Leaf className="h-3 w-3" /> CO2
                  </p>
                  <p className="font-bold text-amber-300">{formatKg(sponsor.co2OffsetKg)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Funding</p>
                  <p className="font-bold text-purple-300">{sponsor.fundingSharePercent.toFixed(1)}%</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default SponsorHallOfFame;
