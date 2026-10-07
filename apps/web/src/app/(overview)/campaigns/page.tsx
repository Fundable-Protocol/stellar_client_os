"use client";

import React, { useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Rocket, Plus, Heart, Users, ShieldCheck, ChevronRight, Trophy, Scale, ShoppingBag, Trees, MapPin, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SuccessStories from "@/components/modules/campaign/success-stories/SuccessStories";
import { CampaignAccessibilityControls } from "@/components/modules/campaign/CampaignAccessibilityControls";
import { CampaignSearchPanel } from "@/components/modules/campaign/CampaignSearchPanel";
import { useCampaigns } from "@/hooks/use-campaigns";
import { useCampaignWishlist } from "@/hooks/use-campaign-wishlist";
import {
  DISCOVERY_REGIONS,
  DISCOVERY_TREE_SPECIES,
  filterCampaignsByDiscoveryOptions,
  type DiscoveryRegion,
  type DiscoveryTreeSpecies,
} from "@/lib/campaign-discovery-filters";

// ---------------------------------------------------------------------------
// Virtual row height constants
// ---------------------------------------------------------------------------
// Each campaign card is rendered at a fixed estimated height. The virtualizer
// uses this as an initial estimate; actual sizes are measured after mount.
const CARD_ESTIMATED_HEIGHT_PX = 280;
// Number of extra rows to render above/below the visible window (overscan).
// A value of 3 avoids blank flashes when scrolling quickly.
const OVERSCAN_COUNT = 3;

export default function CampaignsDirectoryPage() {
const { campaigns } = useCampaigns();
  const { toggleWishlist, isInWishlist } = useCampaignWishlist();
  const [treeSpecies, setTreeSpecies] = useState<DiscoveryTreeSpecies | "All">("All");
  const [region, setRegion] = useState<DiscoveryRegion | "All">("All");
  const filteredCampaigns = useMemo(
    () => filterCampaignsByDiscoveryOptions(campaigns, { treeSpecies, region }),
    [campaigns, treeSpecies, region],
  );

  // ---------------------------------------------------------------------------
  // Virtual scrolling for the campaign list — handles 10k+ campaigns without
  // performance degradation (issue #914).
  //
  // We virtualise a single flat list of items.  For a 2-column layout we pair
  // adjacent campaigns: item at virtual index `i` renders campaigns at array
  // indices `i*2` and `i*2+1`.  This keeps the virtualizer API simple while
  // preserving the existing 2-column grid appearance on medium+ screens.
  // ---------------------------------------------------------------------------
  const rowCount = Math.ceil(filteredCampaigns.length / 2);

  // The scrollable container is the full page body; we attach the virtualizer
  // to a dedicated div wrapper so it does not fight with the outer layout.
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => CARD_ESTIMATED_HEIGHT_PX,
    overscan: OVERSCAN_COUNT,
    // measureElement is automatically used by TanStack Virtual v3 to record
    // actual rendered heights, giving smooth scroll position recovery.
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalListHeight = virtualizer.getTotalSize();

  return (
    <div className="campaign-accessible container mx-auto px-4 py-8 max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-50 tracking-tight flex items-center gap-3">
            <Rocket className="h-8 w-8 text-purple-500" />
            Campaigns Dashboard
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Explore active crowdfunding campaigns, compare initiatives, buy creator toolkits, or launch a new wizard campaign.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CampaignAccessibilityControls />
          <Link href="/campaigns/create">
            <Button className="bg-gradient-to-r from-purple-600 to-blue-600 font-semibold text-white hover-from-purple-700 hover-to-blue-700 shadow-lg shadow-purple-900/30">
              <Plus className="mr-2 h-4 w-4" /> Create Campaign Wizard (#720)
            </Button>
          </Link>
        </div>
<div className="flex flex-wrap items-center gap-2">
        <Link href="/campaigns/create">
          <Button className="bg-gradient-to-r from-purple-600 to-blue-600 font-semibold text-white hover:from-purple-700 hover:to-blue-700 shadow-lg shadow-purple-900/30">
            <Plus className="mr-2 h-4 w-4" /> Create Campaign Wizard (#720)
          </Button>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/campaigns/compare">
            <Button variant="outline" className="border-purple-800 bg-purple-950/40 text-purple-300 hover:bg-purple-900/60 font-semibold text-xs">
              <Scale className="mr-1.5 h-3.5 w-3.5" /> Compare Tool (#778)
            </Button>
          </Link>

          <Link href="/campaigns/marketplace">
            <Button variant="outline" className="border-indigo-800 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/60 font-semibold text-xs">
              <ShoppingBag className="mr-1.5 h-3.5 w-3.5" /> Creator Marketplace (#786)
            </Button>
          </Link>

          <Link href="/campaigns/toolkit">
            <Button variant="outline" className="border-pink-800 bg-pink-950/40 text-pink-300 hover:bg-pink-900/60 font-semibold text-xs">
              <Megaphone className="mr-1.5 h-3.5 w-3.5" /> Marketing Templates (#895)
            </Button>
          </Link>

          <Link href="/grants">
            <Button variant="outline" className="border-amber-800 bg-amber-950/40 text-amber-300 hover:bg-amber-950/60 font-semibold shadow-lg text-xs">
              <Trophy className="mr-1.5 h-3.5 w-3.5" /> Grant Programs
            </Button>
          </Link>

          <Link href="/campaigns/planting-sites">
            <Button variant="outline" className="border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/60 font-semibold shadow-lg text-xs">
              <MapPin className="mr-1.5 h-3.5 w-3.5" /> Planting Sites Map
            </Button>
          </Link>

          <Link href="/campaigns/create">
            <Button className="bg-gradient-to-r from-purple-600 to-blue-600 font-semibold text-xs text-white hover:from-purple-700 hover:to-blue-700 shadow-lg shadow-purple-900/30">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Campaign Wizard (#720)
            </Button>
          </Link>
        </div>
      </div>
      </div>

      {/* Success Stories Section */}
      <SuccessStories />

      <CampaignSearchPanel />

{/* Filter panel */}
      <section aria-label="Filter campaigns" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-zinc-100">Find campaigns by impact</h2>
          <p className="mt-1 text-xs text-zinc-400">Choose a tree species, region, or both.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex w-full flex-col gap-1.5 text-xs font-medium text-zinc-300 sm:max-w-xs">
            <span className="flex items-center gap-2"><Trees className="h-4 w-4 text-emerald-400" /> Tree species</span>
            <select
              aria-label="Filter by tree species"
              value={treeSpecies}
              onChange={(event) => setTreeSpecies(event.target.value as DiscoveryTreeSpecies | "All")}
              className="h-10 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="All">All species</option>
              {DISCOVERY_TREE_SPECIES.map((species) => <option key={species} value={species}>{species}</option>)}
            </select>
          </label>
          <label className="flex w-full flex-col gap-1.5 text-xs font-medium text-zinc-300 sm:max-w-xs">
            <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-sky-400" /> Geographic region</span>
            <select
              aria-label="Filter by geographic region"
              value={region}
              onChange={(event) => setRegion(event.target.value as DiscoveryRegion | "All")}
              className="h-10 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="All">All regions</option>
              {DISCOVERY_REGIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <p className="text-xs text-zinc-400 sm:ml-auto" aria-live="polite">
            Showing {filteredCampaigns.length} of {campaigns.length} campaigns
          </p>
        </div>
      </section>

      {/* Campaign list — virtualised for 10k+ items */}
      {filteredCampaigns.length > 0 ? (
        /*
         * Outer container: fixed-height scrollable window.
         * We cap the visible height at 80 vh so the virtualiser has a finite
         * scroll viewport.  For smaller lists the container shrinks to fit.
         */
        <div
          ref={scrollContainerRef}
          className="overflow-y-auto rounded-xl"
          style={{ maxHeight: "80vh", minHeight: Math.min(totalListHeight, window?.innerHeight ? window.innerHeight * 0.8 : 600) }}
          role="list"
          aria-label="Campaign list"
        >
          {/* Inner spacer: sized to the total virtual list height so the
              browser scrollbar reflects the true content length. */}
          <div style={{ height: totalListHeight, position: "relative" }}>
            {virtualItems.map((virtualRow) => {
              const leftIndex = virtualRow.index * 2;
              const rightIndex = leftIndex + 1;
              const leftCampaign = filteredCampaigns[leftIndex];
              const rightCampaign = filteredCampaigns[rightIndex];

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {/* Each virtual row renders up to 2 campaign cards in a
                      responsive 2-column grid, matching the original layout. */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
                    {[leftCampaign, rightCampaign].map((c, slot) => {
                      if (!c) return null;
                      const progress = Math.round(
                        (parseFloat(String(c.raisedAmount).replace(/,/g, "")) /
                          parseFloat(String(c.goalAmount).replace(/,/g, ""))) *
                          100,
                      ) || 0;
                      const wished = isInWishlist(c.id);

                      return (
                        <div
                          key={`${virtualRow.index}-${slot}`}
                          role="listitem"
                          className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl transition-all duration-300 hover:border-purple-500/50 hover:shadow-2xl relative"
                        >
                          <div className="absolute top-4 right-4 z-10">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleWishlist(c.id)}
                              aria-label={wished ? `Remove ${c.title} from wishlist` : `Add ${c.title} to wishlist`}
                              aria-pressed={wished}
                              className={`rounded-full h-8 w-8 hover:bg-rose-500/20 ${wished ? "text-rose-500 bg-rose-500/10" : "text-zinc-500 hover:text-rose-400"}`}
                            >
                              <Heart className={`h-4 w-4 ${wished ? "fill-rose-500" : ""}`} />
                            </Button>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between pr-10">
                              <Badge className="bg-purple-950/60 text-purple-300 border-purple-800 text-[11px]">
                                {c.category}
                              </Badge>
                              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px] whitespace-nowrap ml-2">
                                <ShieldCheck className="mr-1 h-3 w-3 inline" /> {c.status}
                              </Badge>
                            </div>

                            <h3 className="text-xl font-bold text-zinc-100 group-hover:text-purple-300 transition-colors">
                              {c.title}
                            </h3>
                            <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{c.description}</p>
                          </div>

                          <div className="mt-6 space-y-4 pt-4 border-t border-zinc-800">
                            <div className="flex items-baseline justify-between text-xs">
                              <span className="text-zinc-400">
                                Raised: <strong className="text-zinc-100 font-bold">{c.raisedAmount} {c.token}</strong>
                              </span>
                              <span className="text-emerald-400 font-bold">{progress}% Goal</span>
                            </div>

                            {/* Progress bar */}
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${progress}% funded`}>
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-emerald-400"
                                style={{ width: `${progress}%` }}
                              />
                            </div>

<div className="flex items-center justify-between text-xs pt-1">
                              <div className="flex items-center gap-3 text-zinc-400 text-[11px]">
                                <span className="flex items-center gap-1">
                                  <Heart className="h-3.5 w-3.5 text-rose-400 fill-rose-400/20" />
                                  {c.sponsorCount} Sponsors
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="h-3.5 w-3.5 text-purple-400" />
                                  {c.collaboratorCount} Co-Creators
                                </span>
                              </div>

                              <Link href={`/campaigns/${c.id}`}>
                                <Button size="sm" variant="ghost" className="text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-950/40">
                                  View Campaign <ChevronRight className="ml-1 h-3.5 w-3.5" />
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-700 px-6 py-12 text-center">
          <Trees className="mx-auto h-8 w-8 text-zinc-500" />
          <h2 className="mt-3 text-lg font-semibold text-zinc-100">No campaigns match these filters</h2>
          <p className="mt-1 text-sm text-zinc-400">Try another species or region, or show all campaigns.</p>
          <Button
            variant="outline"
            className="mt-4 border-zinc-700 text-zinc-200"
            onClick={() => { setTreeSpecies("All"); setRegion("All"); }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
