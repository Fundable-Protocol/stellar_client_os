"use client";

import { useQuery } from "@tanstack/react-query";
import { Award } from "lucide-react";

import { useWallet } from "@/providers/StellarWalletProvider";
import {
  getCampaignCreatorBadges,
  CAMPAIGN_CREATOR_BADGES,
  type CampaignRecord,
} from "@/services/campaign.service";
import { Skeleton } from "@/components/ui/skeleton";

async function fetchCreatorCampaigns(address: string, signal: AbortSignal): Promise<CampaignRecord[]> {
  const response = await fetch(`/api/campaigns?creator=${encodeURIComponent(address)}&limit=100`, { signal });
  if (!response.ok) throw new Error("Unable to load campaign history");
  const payload = (await response.json()) as { data?: CampaignRecord[] };
  return payload.data ?? [];
}

export function CampaignCreatorBadge() {
  const { address } = useWallet();
  const { data: campaigns, isLoading, isError } = useQuery({
    queryKey: ["campaign-creator-badges", address],
    queryFn: ({ signal }) => fetchCreatorCampaigns(address!, signal),
    enabled: !!address,
  });

  const campaignCount = campaigns?.length ?? 0;
  const earnedBadges = getCampaignCreatorBadges(campaignCount);
  const earnedNames = new Set(earnedBadges.map((badge) => badge.name));

  return (
    <section
      aria-labelledby="campaign-creator-badges-heading"
      className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="campaign-creator-badges-heading" className="flex items-center gap-2 text-lg font-semibold text-white">
            <Award aria-hidden="true" className="size-5 text-cyan-300" />
            Campaign creator badges
          </h2>
          <p className="mt-1 text-sm text-zinc-400">Earn badges by launching campaigns that make an impact.</p>
        </div>
        {!address ? (
          <p className="text-sm text-zinc-400">Connect your wallet to view your progress.</p>
        ) : isLoading ? (
          <Skeleton className="h-5 w-32 bg-zinc-800" />
        ) : isError ? (
          <p role="alert" className="text-sm text-red-300">Campaign progress is temporarily unavailable.</p>
        ) : (
          <p className="text-sm font-medium text-zinc-300" data-testid="campaign-creator-badge-status">
            {earnedBadges.length > 0 ? `${earnedBadges.at(-1)?.name} badge earned` : "Start your badge journey"}
          </p>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CAMPAIGN_CREATOR_BADGES.map((badge) => {
          const isEarned = earnedNames.has(badge.name);
          return (
            <div
              key={badge.name}
              aria-label={`${badge.name} badge, ${isEarned ? "earned" : "locked"}`}
              className={`rounded-xl border p-3 ${
                isEarned
                  ? "border-cyan-400/50 bg-cyan-950/30 text-cyan-200"
                  : "border-zinc-800 text-zinc-600"
              }`}
            >
              <p className="font-semibold">{badge.name}</p>
              <p className="mt-1 text-xs">{badge.threshold} campaigns</p>
              <p className="mt-2 text-xs">{isEarned ? "Earned" : "Locked"}</p>
            </div>
          );
        })}
      </div>

      {address && !isLoading && !isError && (
        <p className="mt-5 text-xs text-zinc-400">
          {campaignCount.toLocaleString()} {campaignCount === 1 ? "campaign" : "campaigns"} created
        </p>
      )}
    </section>
  );
}

export default CampaignCreatorBadge;
