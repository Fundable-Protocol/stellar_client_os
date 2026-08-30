"use client";

/**
 * ImpactComparison — Sponsor impact vs. the global average (issue #639)
 *
 * Shows a connected sponsor their estimated CO2 offset compared with the
 * global average sponsor, plus their ranking percentile (top 10%, etc.).
 *
 * Data is fetched from the GraphQL analytics gateway (`/api/graphql`),
 * which aggregates on-chain stream funding volume per sponsor.
 *
 * States handled:
 *   - Wallet not connected → connect prompt
 *   - Loading               → skeleton placeholders
 *   - Fetch error           → inline error with retry
 *   - No comparison data    → informative empty state
 *   - Success               → comparison card with ranking band
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, Leaf, Sprout, Trophy } from "lucide-react";
import { useWallet } from "@/providers/StellarWalletProvider";
import { ConnectWalletPrompt } from "@/components/layouts/ProtectedRoute";
import { Skeleton } from "@/components/ui/skeleton";
import { withAbortSignal } from "@/utils/retry";
import { cn } from "@/lib/utils";
import {
  fetchSponsorImpact,
  type RankingBand,
} from "@/services/impact.service";

// ── Ranking band presentation ────────────────────────────────────────────────

const RANKING_BAND_META: Record<
  RankingBand,
  { label: string; badgeClassName: string }
> = {
  top_1: {
    label: "Top 1%",
    badgeClassName: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  top_5: {
    label: "Top 5%",
    badgeClassName: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  top_10: {
    label: "Top 10%",
    badgeClassName: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  top_25: {
    label: "Top 25%",
    badgeClassName: "bg-teal-500/10 text-teal-400 border-teal-500/30",
  },
  top_50: {
    label: "Top 50%",
    badgeClassName: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30",
  },
  below_average: {
    label: "Building momentum",
    badgeClassName: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30",
  },
};

// ── Formatting helpers ───────────────────────────────────────────────────────

function formatUsd(volumeUsd: string): string {
  const n = Number(volumeUsd);
  if (!Number.isFinite(n)) return "$0";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatCo2Kg(kg: number): string {
  if (!Number.isFinite(kg)) return "0";
  return kg.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ImpactStat({
  label,
  value,
  unit,
  detail,
  accent = false,
  testId,
}: {
  label: string;
  value: string;
  unit: string;
  detail: string;
  accent?: boolean;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-xl border p-4",
        accent
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-zinc-800 bg-zinc-950/40"
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">
        {label}
      </p>
      <p
        className={cn(
          "text-2xl font-bold",
          accent ? "text-emerald-400" : "text-white"
        )}
      >
        {value}
        <span className="ml-1 text-sm font-medium text-zinc-400">{unit}</span>
      </p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function ComparisonBar({
  label,
  value,
  percent,
  accent = false,
}: {
  label: string;
  value: string;
  percent: number;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm text-zinc-400">{label}</span>
        <span className="text-sm font-medium text-zinc-200">{value}</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`${label} funded volume`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            accent
              ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
              : "bg-zinc-600"
          )}
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading impact comparison">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-28 rounded-xl bg-zinc-800" />
        <Skeleton className="h-28 rounded-xl bg-zinc-800" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-8 w-full rounded-lg bg-zinc-800" />
        <Skeleton className="h-8 w-2/3 rounded-lg bg-zinc-800" />
      </div>
      <Skeleton className="h-16 w-full rounded-xl bg-zinc-800" />
    </div>
  );
}

function EmptyState() {
  return (
    <div
      data-testid="impact-empty"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-800 py-10 text-center"
    >
      <Sprout className="h-8 w-8 text-zinc-600" aria-hidden="true" />
      <p className="text-sm font-medium text-zinc-300">No comparison data yet</p>
      <p className="max-w-sm text-xs text-zinc-500">
        Once there is on-chain funding activity to aggregate, you&apos;ll see how
        your impact compares with sponsors around the world.
      </p>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export interface ImpactComparisonProps {
  className?: string;
}

export function ImpactComparison({ className }: ImpactComparisonProps) {
  const { address } = useWallet();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["sponsor-impact", address],
    queryFn: ({ signal }) =>
      address
        ? withAbortSignal(fetchSponsorImpact(address), signal)
        : Promise.resolve(null),
    enabled: !!address,
  });

  const comparison = useMemo(() => {
    if (!data) return null;

    const myVolume = Number(data.myVolumeUsd) || 0;
    const avgVolume = Number(data.globalAverageVolumeUsd) || 0;
    const maxVolume = Math.max(myVolume, avgVolume, 1);

    return {
      myVolumePercent: Math.round((myVolume / maxVolume) * 100),
      avgVolumePercent: Math.round((avgVolume / maxVolume) * 100),
      hasData: data.globalSponsorCount > 0 && data.percentile !== null,
    };
  }, [data]);

  if (!address) {
    return (
      <ConnectWalletPrompt
        title="Connect your wallet"
        description="Connect your Stellar wallet to see how your impact compares with sponsors around the world."
        containerClassName="min-h-[300px]"
      />
    );
  }

  const bandMeta =
    data && data.rankingBand ? RANKING_BAND_META[data.rankingBand] : null;

  return (
    <section
      aria-label="Impact comparison"
      data-testid="impact-comparison"
      className={cn(
        "bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6",
        className
      )}
    >
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Your Impact vs. the Global Average
          </h3>
          <p className="text-sm text-zinc-400">
            See how your funding activity compares with sponsors around the
            world.
          </p>
        </div>
        <Leaf className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
      </div>

      {isLoading && <LoadingState />}

      {!isLoading && isError && (
        <div
          data-testid="impact-error"
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-800/50 bg-red-950/30 p-4"
        >
          <p className="text-sm text-red-400">
            {error instanceof Error
              ? error.message
              : "Something went wrong while loading your impact comparison."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-md bg-red-900/60 px-3 py-1.5 text-xs font-medium text-red-100 transition-colors hover:bg-red-900"
          >
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && data && comparison && !comparison.hasData && (
        <EmptyState />
      )}

      {!isLoading && !isError && data && comparison && comparison.hasData && (
        <>
          {/* My impact vs global average */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <ImpactStat
              testId="impact-my-co2"
              label="My CO2 offset"
              value={formatCo2Kg(data.myCo2OffsetKg)}
              unit="kg CO₂e"
              detail={`≈ ${formatUsd(data.myVolumeUsd)} funded`}
              accent
            />
            <ImpactStat
              testId="impact-average-co2"
              label="Global average sponsor"
              value={formatCo2Kg(data.globalAverageCo2OffsetKg)}
              unit="kg CO₂e"
              detail={`≈ ${formatUsd(data.globalAverageVolumeUsd)} funded per sponsor`}
            />
          </div>

          {/* Volume comparison bars */}
          <div className="mb-6 space-y-4">
            <ComparisonBar
              label="You"
              value={formatUsd(data.myVolumeUsd)}
              percent={comparison.myVolumePercent}
              accent
            />
            <ComparisonBar
              label="Global average sponsor"
              value={formatUsd(data.globalAverageVolumeUsd)}
              percent={comparison.avgVolumePercent}
            />
          </div>

          {/* Ranking */}
          {bandMeta && data.percentile !== null && (
            <div
              data-testid="impact-ranking"
              className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fundable-purple-2/10">
                  <Trophy
                    className="h-5 w-5 text-fundable-purple-2"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="text-xs text-zinc-400">You&apos;re in the</p>
                  <p className="text-xl font-bold text-white">
                    <span data-testid="impact-ranking-band">{bandMeta.label}</span>{" "}
                    <span className="text-sm font-medium text-zinc-400">
                      of sponsors
                    </span>
                  </p>
                </div>
              </div>

              <div
                data-testid="impact-ranking-detail"
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-300"
              >
                You&apos;ve funded more than{" "}
                <span className="font-semibold text-emerald-400">
                  {data.percentile}%
                </span>{" "}
                of{" "}
                <span className="font-semibold text-white">
                  {data.globalSponsorCount.toLocaleString("en-US")}
                </span>{" "}
                sponsors
              </div>
            </div>
          )}

          {/* Footnote */}
          <div className="mt-6 flex items-start gap-2 text-xs text-zinc-500">
            <Info
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            <p>
              Impact is an estimate calculated at{" "}
              {data.co2PerUsdKg} kg CO₂e per $1 funded, based on your on-chain
              stream activity.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

export default ImpactComparison;
