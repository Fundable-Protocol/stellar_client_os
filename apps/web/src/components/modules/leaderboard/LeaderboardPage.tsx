"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getMonthlyLeaderboard,
  monthKey,
  type LeaderboardEntry,
  type LeaderboardRole,
} from "@/services/leaderboard.service";
import type { CampaignRecord } from "@/services/campaign.service";

type LeaderboardTab = LeaderboardRole | "campaign";

const TABS: { role: LeaderboardTab; label: string }[] = [
  { role: "sponsor", label: "Top Sponsors" },
  { role: "planter", label: "Top Planters" },
  { role: "campaign", label: "Top Campaigns" },
];

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNum - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function bonusVariant(type: string) {
  if (type === "XLM") return "default";
  if (type === "NFT") return "secondary";
  return "outline";
}

function CampaignLeaderboard() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const loadCampaigns = async () => {
      try {
        const response = await fetch("/api/campaigns?sort=treeCount&direction=desc&limit=10", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load campaign leaderboard");
        const payload = (await response.json()) as { data?: CampaignRecord[] };
        setCampaigns(payload.data ?? []);
      } catch (cause) {
        if ((cause as Error).name !== "AbortError") setError(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void loadCampaigns();
    return () => controller.abort();
  }, []);

  if (isLoading) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading campaign leaderboard…</p>;
  }

  if (error) {
    return <p role="alert" className="px-4 py-8 text-center text-sm text-red-300">Campaign leaderboard is temporarily unavailable.</p>;
  }

  if (campaigns.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No campaigns recorded yet.</p>;
  }

  return (
    <ol className="flex flex-col divide-y divide-border">
      {campaigns.map((campaign, index) => (
        <li key={campaign.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                index < 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{campaign.name}</p>
              <p className="truncate text-xs text-muted-foreground">Creator: {truncateAddress(campaign.creator)}</p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-medium text-white">{campaign.treeCount.toLocaleString()} trees planted</p>
            <p className="text-xs text-muted-foreground">{campaign.raisedAmount.toLocaleString()} raised</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function LeaderboardTable({ entries, role }: { entries: LeaderboardEntry[]; role: LeaderboardRole }) {
  if (entries.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        No {role === "sponsor" ? "sponsorships" : "completed trees"} recorded yet this month.
      </p>
    );
  }

  return (
    <ol className="flex flex-col divide-y divide-border">
      {entries.map((entry) => (
        <li key={entry.address} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                entry.rank <= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {entry.rank}
            </span>
            <span className="font-mono text-sm text-white">{truncateAddress(entry.address)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {entry.points.toLocaleString()} {role === "sponsor" ? "stroops" : "trees"}
            </span>
            {entry.bonus && <Badge variant={bonusVariant(entry.bonus.type)}>{entry.bonus.label}</Badge>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function LeaderboardPage() {
  const [role, setRole] = useState<LeaderboardTab>("sponsor");
  const currentMonth = monthKey();

  const entries = useMemo(
    () => (role === "campaign" ? [] : getMonthlyLeaderboard(role, currentMonth)),
    [role, currentMonth],
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Trophy aria-hidden="true" className="size-6 text-primary" />
          Monthly Leaderboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatMonthLabel(currentMonth)} · top sponsors and planters earn a monthly bonus. Campaigns are ranked
          by total trees planted.
        </p>
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Leaderboard category">
        {TABS.map((tab) => (
          <button
            key={tab.role}
            type="button"
            role="tab"
            aria-selected={role === tab.role}
            onClick={() => setRole(tab.role)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              role === tab.role
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border">
        {role === "campaign" ? <CampaignLeaderboard /> : <LeaderboardTable entries={entries} role={role} />}
      </div>
    </div>
  );
}
