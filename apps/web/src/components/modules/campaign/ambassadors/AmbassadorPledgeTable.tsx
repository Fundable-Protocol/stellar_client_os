"use client";

/**
 * Per-ambassador pledge tracking table.
 *
 * Shows every ambassador of a campaign with their tier, the amount they have
 * pledged, their progress towards the next tier and the rewards they earned.
 */

import { AlertCircle, Loader2, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/modules/campaign/ambassadors/AmbassadorProgress";
import type { AmbassadorPledgeSummary } from "@/types/ambassador";

export interface AmbassadorPledgeTableProps {
  summaries: AmbassadorPledgeSummary[];
  loading?: boolean;
  /** Called when a row action is triggered (e.g. remove). */
  onSelect?: (summary: AmbassadorPledgeSummary) => void;
}

function formatAmount(amount: string): string {
  try {
    const value = BigInt(amount);
    return value.toLocaleString();
  } catch {
    return amount;
  }
}

const TIER_STYLES: Record<string, string> = {
  SEED: "bg-zinc-700/50 text-zinc-300",
  SPROUT: "bg-lime-500/15 text-lime-300",
  BLOOM: "bg-emerald-500/15 text-emerald-300",
  CANOPY: "bg-purple-500/20 text-purple-300",
};

export function AmbassadorPledgeTable({
  summaries,
  loading = false,
  onSelect,
}: AmbassadorPledgeTableProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading ambassadors…
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center">
        <Users className="mx-auto h-8 w-8 text-zinc-700" />
        <p className="mt-2 text-sm font-medium text-zinc-400">No ambassadors yet</p>
        <p className="mt-1 text-xs text-zinc-600">
          Invite your first ambassador to start promoting this campaign.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Ambassador
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Tier
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Pledged
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Progress to next tier
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Rewards
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/80">
          {summaries.map((summary) => {
            const { ambassador } = summary;
            return (
              <tr
                key={ambassador.id}
                className={`transition-colors hover:bg-zinc-900/60 ${
                  onSelect ? "cursor-pointer" : ""
                }`}
                onClick={() => onSelect?.(summary)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-300">
                      {ambassador.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-100">{ambassador.name}</p>
                      <p className="truncate text-xs text-zinc-500">{ambassador.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge className={`text-[11px] ${TIER_STYLES[ambassador.tier] ?? ""}`}>
                    {summary.tier.label}
                  </Badge>
                  {ambassador.status !== "active" && (
                    <Badge className="ml-1 bg-zinc-700/40 text-[11px] text-zinc-400">
                      {ambassador.status}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-zinc-100">{formatAmount(summary.pledgedAmount)}</p>
                  <p className="text-xs text-zinc-500">
                    {summary.pledgeCount} pledge{summary.pledgeCount === 1 ? "" : "s"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {summary.nextTier ? (
                    <div className="space-y-1">
                      <Progress value={summary.progressToNextTier} />
                      <p className="flex items-center gap-1 text-xs text-zinc-500">
                        <TrendingUp className="h-3 w-3" />
                        {formatAmount(summary.amountToNextTier)} to {summary.nextTier.label}
                      </p>
                    </div>
                  ) : (
                    <p className="flex items-center gap-1 text-xs text-purple-300">
                      <AlertCircle className="h-3 w-3" /> Top tier reached
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {summary.rewards.length === 0 ? (
                    <span className="text-xs text-zinc-600">None yet</span>
                  ) : (
                    <ul className="space-y-1">
                      {summary.rewards.map((reward) => (
                        <li key={reward.id} className="text-xs text-zinc-400">
                          <span className="font-medium text-emerald-300">{reward.tier}</span> ·{" "}
                          {reward.amount} · {reward.status}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default AmbassadorPledgeTable;
