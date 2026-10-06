"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, Trees, Layers } from "lucide-react";
import { PlantingSitesMap } from "@/components/modules/campaign/geolocation/PlantingSitesMap";
import type {
  CampaignPlantingSite,
  PlantingSitesStats,
} from "@/services/campaign-geolocation.service";

export default function PlantingSitesPage() {
  const [sites, setSites] = useState<CampaignPlantingSite[]>([]);
  const [stats, setStats] = useState<PlantingSitesStats | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPlantingSites() {
      try {
        const res = await fetch("/api/campaigns/planting-sites");
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const payload = await res.json();
        if (cancelled) return;
        setSites(payload.data ?? []);
        setStats(payload.stats ?? undefined);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load planting sites");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadPlantingSites();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      <div className="flex items-center gap-2">
        <Link
          href="/campaigns"
          className="inline-flex items-center text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Campaigns
        </Link>
      </div>

      {/* Page header */}
      <div className="border-b border-zinc-800 pb-6">
        <h1 className="text-3xl font-extrabold text-zinc-50 tracking-tight flex items-center gap-3">
          <MapPin className="h-8 w-8 text-emerald-500" />
          Global Planting Sites
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Every active campaign planting location worldwide — tree counts and species from stored
          GPS coordinates.
        </p>
      </div>

      {/* Stats cards */}
      <section
        aria-label="Planting site statistics"
        className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <MapPin className="h-4 w-4 text-emerald-400" /> Planting Sites
          </div>
          <p className="mt-2 text-2xl font-black text-zinc-50 tabular-nums">
            {isLoading ? "…" : (stats?.totalSites ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Layers className="h-4 w-4 text-purple-400" /> Campaigns Mapped
          </div>
          <p className="mt-2 text-2xl font-black text-zinc-50 tabular-nums">
            {isLoading ? "…" : (stats?.totalCampaigns ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Trees className="h-4 w-4 text-emerald-400" /> Total Trees
          </div>
          <p className="mt-2 text-2xl font-black text-zinc-50 tabular-nums">
            {isLoading ? "…" : (stats?.totalTrees ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Trees className="h-4 w-4 text-amber-400" /> Species
          </div>
          <p className="mt-2 text-2xl font-black text-zinc-50 tabular-nums">
            {isLoading ? "…" : (stats?.speciesCounts.length ?? 0).toLocaleString()}
          </p>
        </div>
      </section>

      {/* Interactive map */}
      <section className="rounded-2xl overflow-hidden border border-zinc-800">
        {error ? (
          <div
            className="flex min-h-[320px] items-center justify-center bg-zinc-950 px-6 text-center"
            role="alert"
          >
            <div>
              <p className="text-sm font-semibold text-red-400">Failed to load planting sites</p>
              <p className="mt-1 text-xs text-zinc-500">{error}</p>
            </div>
          </div>
        ) : (
          <PlantingSitesMap sites={sites} stats={stats} isLoading={isLoading} />
        )}
      </section>

      <p className="text-xs text-zinc-500">
        Tree counts are distributed evenly across a campaign&apos;s stored GPS coordinates, so the
        map total never exceeds the campaign&apos;s verified planting count.
      </p>
    </div>
  );
}