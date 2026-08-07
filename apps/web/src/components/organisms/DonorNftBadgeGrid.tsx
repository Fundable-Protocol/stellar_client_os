"use client";

/**
 * DonorNftBadgeGrid — Responsive grid of donor NFT badge cards (issue #530)
 *
 * Renders a collection of DonorNftBadgeCards in a responsive CSS grid.
 * Handles loading skeletons, empty state, and error state.
 *
 * # Layout
 *   - Mobile  (< 640px):  1 column
 *   - Tablet  (640–1024): 2 columns
 *   - Desktop (≥ 1024):   3 columns
 *   - Wide    (≥ 1280):   4 columns
 */

import React from "react";
import { Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { DonorNftBadgeCard, type DonorNftBadge, type DonorNftBadgeCardProps } from "./DonorNftBadgeCard";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DonorNftBadgeGridProps {
  badges: DonorNftBadge[];
  isLoading?: boolean;
  error?: string | null;
  /** Number of skeleton cards to show while loading. Default: 6 */
  skeletonCount?: number;
  onBadgeClick?: (badge: DonorNftBadge) => void;
  className?: string;
  cardProps?: Omit<DonorNftBadgeCardProps, "badge">;
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-2xl border border-white/10 bg-white/5",
        "animate-pulse overflow-hidden"
      )}
    >
      {/* Image placeholder */}
      <div className="aspect-square w-full bg-white/10" />
      {/* Content placeholder */}
      <div className="flex flex-col gap-2 p-4">
        <div className="h-3.5 w-3/4 rounded-full bg-white/10" />
        <div className="h-3 w-full rounded-full bg-white/10" />
        <div className="h-3 w-2/3 rounded-full bg-white/10" />
        <div className="mt-2 h-px w-full bg-white/10" />
        <div className="flex items-center justify-between">
          <div className="h-3 w-20 rounded-full bg-white/10" />
          <div className="h-3 w-12 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      role="status"
      aria-label="No NFT badges found"
      className="col-span-full flex flex-col items-center justify-center gap-4 py-20 text-center"
    >
      <Award
        aria-hidden="true"
        className="h-12 w-12 text-white/20"
      />
      <div className="space-y-1">
        <p className="text-sm font-medium text-white/50">No badges yet</p>
        <p className="text-xs text-white/30">
          Contribute to earn donor achievement badges.
        </p>
      </div>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="col-span-full rounded-xl border border-red-800/50 bg-red-950/30 p-6 text-center"
    >
      <p className="text-sm font-medium text-red-400">{message}</p>
    </div>
  );
}

// ── Grid component ────────────────────────────────────────────────────────────

export function DonorNftBadgeGrid({
  badges,
  isLoading = false,
  error = null,
  skeletonCount = 6,
  onBadgeClick,
  className,
  cardProps,
}: DonorNftBadgeGridProps) {
  return (
    <section
      aria-label="Donor NFT badge collection"
      aria-busy={isLoading}
      className={cn(
        "grid gap-4",
        "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className
      )}
    >
      {isLoading &&
        Array.from({ length: skeletonCount }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}

      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && badges.length === 0 && <EmptyState />}

      {!isLoading &&
        !error &&
        badges.map((badge) => (
          <DonorNftBadgeCard
            key={badge.tokenId}
            badge={badge}
            onClick={onBadgeClick}
            {...cardProps}
          />
        ))}
    </section>
  );
}

export default DonorNftBadgeGrid;
