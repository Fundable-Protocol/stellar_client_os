"use client";

import React from "react";
import { Sponsor, formatTruncatedAddress } from "@/types/sponsor";
import { Badge } from "@/components/ui/badge";
import { Award, Sparkles, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SponsorCardProps {
  sponsor: Sponsor;
}

const TIER_STYLES: Record<Sponsor["tier"], { badgeClass: string; borderClass: string; iconColor: string }> = {
  PLATINUM: {
    badgeClass: "bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-sm shadow-purple-500/20",
    borderClass: "border-purple-500/30 hover:border-purple-400 bg-gradient-to-br from-purple-950/20 via-zinc-900 to-zinc-900",
    iconColor: "text-purple-400",
  },
  GOLD: {
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/20",
    borderClass: "border-amber-500/30 hover:border-amber-400 bg-gradient-to-br from-amber-950/20 via-zinc-900 to-zinc-900",
    iconColor: "text-amber-400",
  },
  SILVER: {
    badgeClass: "bg-slate-400/20 text-slate-200 border-slate-400/40",
    borderClass: "border-slate-700 hover:border-slate-500 bg-zinc-900",
    iconColor: "text-slate-300",
  },
  BRONZE: {
    badgeClass: "bg-orange-600/20 text-orange-300 border-orange-600/40",
    borderClass: "border-zinc-800 hover:border-zinc-700 bg-zinc-900/80",
    iconColor: "text-orange-400",
  },
};

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function SponsorCard({ sponsor }: SponsorCardProps) {
  const tierStyle = TIER_STYLES[sponsor.tier];

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border p-4.5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
        tierStyle.borderClass,
        sponsor.isRecent && "ring-2 ring-emerald-400/80 animate-pulse shadow-lg shadow-emerald-500/20"
      )}
    >
      {sponsor.isRecent && (
        <div className="absolute -top-2 -right-2 flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-950 shadow-md">
          <Sparkles className="h-3 w-3" /> New
        </div>
      )}

      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {sponsor.avatarUrl ? (
              <img
                src={sponsor.avatarUrl}
                alt={sponsor.name || sponsor.address}
                className="h-10 w-10 rounded-full border border-zinc-700 object-cover shadow-sm group-hover:scale-105 transition-transform"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 font-semibold text-zinc-300 border border-zinc-700 shadow-sm">
                {(sponsor.name || sponsor.address).substring(0, 2).toUpperCase()}
              </div>
            )}

            <div>
              <h4 className="font-semibold text-zinc-100 text-sm group-hover:text-white transition-colors line-clamp-1">
                {sponsor.name || formatTruncatedAddress(sponsor.address)}
              </h4>
              <p className="text-[11px] text-zinc-400 font-mono">
                {sponsor.name ? formatTruncatedAddress(sponsor.address) : "Stellar Supporter"}
              </p>
            </div>
          </div>

          <Badge variant="outline" className={cn("text-[10px] uppercase font-bold tracking-wider", tierStyle.badgeClass)}>
            <Award className={cn("mr-1 h-3 w-3 inline", tierStyle.iconColor)} />
            {sponsor.tier}
          </Badge>
        </div>

        {sponsor.message && (
          <div className="mt-3 flex items-start gap-1.5 text-xs text-zinc-300 italic bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800/60">
            <MessageSquare className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
            <p className="line-clamp-2">"{sponsor.message}"</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-zinc-800/80 pt-3 text-xs">
        <div className="flex items-baseline gap-1">
          <span className="text-base font-bold text-zinc-50">{sponsor.amount}</span>
          <span className="font-semibold text-purple-400">{sponsor.token}</span>
        </div>
        <span className="text-[11px] text-zinc-400">{formatTimeAgo(sponsor.sponsoredAt)}</span>
      </div>
    </div>
  );
}
