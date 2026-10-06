"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import type { CampaignPlantingSite, PlantingSitesStats } from "@/services/campaign-geolocation.service";

const PlantingSitesMapView = dynamic(
  () => import("./PlantingSitesMapView").then((mod) => mod.PlantingSitesMapView),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  },
);

function MapSkeleton() {
  return (
    <div
      className="relative w-full h-full min-h-[320px] sm:min-h-[440px] rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950"
      role="status"
      aria-label="Loading planting sites map"
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-fundable-purple border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-500">Loading planting sites map...</p>
        </div>
      </div>
    </div>
  );
}

function MapErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div
      className="relative w-full h-full min-h-[320px] sm:min-h-[440px] rounded-2xl overflow-hidden border border-red-900/50 bg-zinc-950 flex items-center justify-center"
      role="alert"
    >
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-500"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-sm text-red-400">Planting sites map failed to load</p>
        <p className="text-xs text-zinc-500 max-w-md">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-fundable-purple text-white hover:bg-fundable-purple/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fundable-purple"
          type="button"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function SpeciesLegend({
  speciesCounts,
}: {
  speciesCounts: Array<{ species: string; count: number }>;
}) {
  if (speciesCounts.length === 0) return null;
  return (
    <div
      className="absolute top-3 left-3 z-[1000] flex flex-wrap gap-1.5 max-w-[240px]"
      role="status"
      aria-label="Tree species planted"
    >
      {speciesCounts.slice(0, 6).map((entry) => (
        <div
          key={entry.species}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-sm border border-zinc-800 text-xs text-zinc-300"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="truncate">{entry.species}</span>
          <span className="text-zinc-500 tabular-nums">{entry.count.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export interface PlantingSitesMapProps {
  sites: CampaignPlantingSite[];
  stats?: PlantingSitesStats;
  className?: string;
  isLoading?: boolean;
}

/**
 * Interactive global map of every active campaign planting site.
 *
 * Renders each stored GPS point as a marker whose size scales with the number
 * of trees planted there; selecting a marker opens a popup with the campaign,
 * tree total and species list. Only rendered on the client (Leaflet).
 */
export function PlantingSitesMap({
  sites,
  stats,
  className = "",
  isLoading,
}: PlantingSitesMapProps) {
  const speciesCounts = useMemo(
    () => stats?.speciesCounts ?? [],
    [stats],
  );

  return (
    <ErrorBoundary
      boundaryName="PlantingSitesMap"
      fallbackRender={({ error, reset }) => <MapErrorFallback error={error} reset={reset} />}
    >
      <div className="relative w-full h-full flex flex-col gap-3">
        <PlantingSitesMapView
          sites={sites}
          className={className}
          isLoading={isLoading}
        />
        {!isLoading && <SpeciesLegend speciesCounts={speciesCounts} />}
      </div>
    </ErrorBoundary>
  );
}