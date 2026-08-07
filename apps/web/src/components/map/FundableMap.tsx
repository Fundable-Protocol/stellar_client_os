"use client";

import dynamic from "next/dynamic";
import { useMemo, useCallback, useState, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import type { FundableMapProps, FundableMapFilters, FundableStream } from "./types";
import { filterStreams, getStatusColor } from "./cluster-utils";

const MapView = dynamic(
  () => import("./FundableMapView").then((mod) => mod.FundableMapView),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  },
);

function MapSkeleton() {
  return (
    <div
      className="relative w-full h-full min-h-[300px] sm:min-h-[400px] rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950"
      role="status"
      aria-label="Loading map"
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-fundable-purple border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-500">Loading map...</p>
        </div>
      </div>
    </div>
  );
}

interface StatusCount {
  status: string;
  count: number;
  color: string;
}

function StatusLegend({ counts }: { counts: StatusCount[] }) {
  if (counts.length === 0) return null;

  return (
    <div
      className="absolute top-3 left-3 z-[1000] flex flex-wrap gap-1.5"
      role="status"
      aria-label="Stream status legend"
    >
      {counts.map((s) => (
        <div
          key={s.status}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-sm border border-zinc-800 text-xs text-zinc-300"
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: s.color }}
          />
          <span className="capitalize">{s.status}</span>
          <span className="text-zinc-500 tabular-nums">{s.count}</span>
        </div>
      ))}
    </div>
  );
}

function MapErrorFallback({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div
      className="relative w-full h-full min-h-[300px] sm:min-h-[400px] rounded-2xl overflow-hidden border border-red-900/50 bg-zinc-950 flex items-center justify-center"
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
        <p className="text-sm text-red-400">Map failed to load</p>
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

export function FundableMap(props: FundableMapProps) {
  const {
    streams,
    className,
    onStreamSelect,
    onFilterChange,
    filters,
    isLoading,
  } = props;

  const filteredStreams = useMemo(
    () => filterStreams(streams, filters),
    [streams, filters],
  );

  const [internalFilters, setInternalFilters] = useState<FundableMapFilters>(
    {},
  );

  const activeFilters = filters ?? internalFilters;
  const setActiveFilters = onFilterChange ?? setInternalFilters;

  const handleFilterChange = useCallback(
    (newFilters: FundableMapFilters) => {
      setActiveFilters(newFilters);
    },
    [setActiveFilters],
  );

  const statusCounts: StatusCount[] = useMemo(() => {
    const counts: Record<string, number> = {
      active: 0,
      funded: 0,
      pending: 0,
    };
    streams.forEach((s) => {
      counts[s.status]++;
    });
    return [
      { status: "active", count: counts.active, color: getStatusColor("active") },
      { status: "funded", count: counts.funded, color: getStatusColor("funded") },
      { status: "pending", count: counts.pending, color: getStatusColor("pending") },
    ].filter((s) => s.count > 0);
  }, [streams]);

  const handleStreamSelect = useCallback(
    (stream: FundableStream) => {
      onStreamSelect?.(stream);
    },
    [onStreamSelect],
  );

  return (
    <ErrorBoundary
      boundaryName="FundableMap"
      fallbackRender={({ error, reset }) => (
        <MapErrorFallback error={error} reset={reset} />
      )}
    >
      <div className="relative w-full h-full flex flex-col gap-3">
        <MapView
          streams={filteredStreams}
          className={className}
          onStreamSelect={handleStreamSelect}
          isLoading={isLoading}
        />
        {!isLoading && (
          <StatusLegend counts={statusCounts} />
        )}
      </div>
    </ErrorBoundary>
  );
}
