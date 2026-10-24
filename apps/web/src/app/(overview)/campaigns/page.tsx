"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Rocket, Plus, Heart, Users, ShieldCheck, ChevronRight, Trophy, Scale, ShoppingBag, Trees, MapPin, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SuccessStories from "@/components/modules/campaign/success-stories/SuccessStories";
import { CampaignAccessibilityControls } from "@/components/modules/campaign/CampaignAccessibilityControls";
import { CampaignSearchPanel } from "@/components/modules/campaign/CampaignSearchPanel";
import { VirtualizedCampaignGrid } from "@/components/modules/campaign/VirtualizedCampaignGrid";
import { useCampaigns } from "@/hooks/use-campaigns";
import { CharityBadge } from "@/components/modules/campaign/CharityBadge";
import { StaffPickBadge } from "@/components/modules/campaign/StaffPickBadge";
import { LiveStreamBadge } from "@/components/modules/campaign/live-stream/LiveStreamBadge";
import { StaffPicksSection } from "@/components/modules/campaign/StaffPicksSection";
import { useCampaignWishlist } from "@/hooks/use-campaign-wishlist";
import {
  DISCOVERY_REGIONS,
  DISCOVERY_TREE_SPECIES,
  filterCampaignsByDiscoveryOptions,
  getAllCampaignTags,
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

// Stable key extractor so the virtualiser's measurement cache survives
// re-renders (a fresh function identity would invalidate it every time).
const getCampaignKey = (campaign: { id: string }): string => campaign.id;

export default function CampaignsDirectoryPage() {
const { campaigns } = useCampaigns();
  const { toggleWishlist, isInWishlist } = useCampaignWishlist();
  const [treeSpecies, setTreeSpecies] = useState<DiscoveryTreeSpecies | "All">("All");
  const [region, setRegion] = useState<DiscoveryRegion | "All">("All");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Distinct categories present across all campaigns, used to render the
  // multi-category facet checkboxes.
  const availableCategories = useMemo(
    () => Array.from(new Set(campaigns.map((c) => c.category).filter(Boolean))).sort(),
    [campaigns],
  );

  // Distinct tags previously used across campaigns, used to populate the
  // searchable tag multi-select.
  const availableTags = useMemo(() => getAllCampaignTags(campaigns), [campaigns]);

  const filteredCampaigns = useMemo(
    () =>
      filterCampaignsByDiscoveryOptions(campaigns, {
        treeSpecies,
        region,
        categories: selectedCategories,
        tags: selectedTags,
      }),
    [campaigns, treeSpecies, region, selectedCategories, selectedTags],
  );

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((item) => item !== category) : [...prev, category],
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  };

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

          <Link href="/campaigns/social-scheduler">
            <Button variant="outline" className="border-sky-800 bg-sky-950/40 text-sky-300 hover:bg-sky-900/60 font-semibold text-xs">
              <Megaphone className="mr-1.5 h-3.5 w-3.5" /> Social Scheduler (#1266)
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

      {/* Staff Picks Section curated by editorial team */}
      <StaffPicksSection />

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

        {/* Category facet — multi-select checkboxes */}
        <fieldset className="mt-4 border-t border-zinc-800 pt-4">
          <legend className="text-xs font-medium text-zinc-300">Categories</legend>
          {availableCategories.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {availableCategories.map((category) => (
                <label key={category} className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-purple-500 focus:ring-purple-500"
                    checked={selectedCategories.includes(category)}
                    onChange={() => toggleCategory(category)}
                    aria-label={`Filter by category ${category}`}
                  />
                  {category}
                </label>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">No categories available yet.</p>
          )}
        </fieldset>

        {/* Tag facet — multi-select with searchable options */}
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <label className="flex w-full flex-col gap-1.5 text-xs font-medium text-zinc-300 sm:max-w-md">
            <span>Tags</span>
            <select
              aria-label="Filter by tags"
              multiple
              size={Math.min(Math.max(availableTags.length, 3), 6)}
              value={selectedTags}
              onChange={(event) => {
                const values = Array.from(event.target.selectedOptions, (option) => option.value);
                setSelectedTags(values);
              }}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-purple-500"
            >
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </label>
          {selectedTags.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {selectedTags.map((tag) => (
                <Badge key={tag} className="bg-purple-950/60 text-purple-300 border-purple-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-label={`Remove tag filter ${tag}`}
                    className="mr-1 text-purple-300 hover:text-purple-100"
                  >
                    ×
                  </button>
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Campaign list — virtualised for 10k+ items */}
      {filteredCampaigns.length > 0 ? (
        /*
         * Outer container: fixed-height scrollable window.
         * We cap the visible height at 80 vh so the virtualiser has a finite
         * scroll viewport.  For smaller lists the container shrinks to fit.
         */
        <VirtualizedCampaignGrid
          items={filteredCampaigns}
          getItemKey={getCampaignKey}
          minColumnWidth={340}
          maxColumns={2}
          initialColumns={2}
          gap={24}
          estimateRowHeight={CARD_ESTIMATED_HEIGHT_PX}
          overscan={OVERSCAN_COUNT}
          maxHeight="80vh"
          ariaLabel="Campaign list"
          renderItem={(c) => {
            const progress = Math.round(
              (parseFloat(String(c.raisedAmount).replace(/,/g, "")) /
                parseFloat(String(c.goalAmount).replace(/,/g, ""))) *
                100,
            ) || 0;
            const wished = isInWishlist(c.id);

            return (
              <div className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl transition-all duration-300 hover:border-purple-500/50 hover:shadow-2xl relative">
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
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge className="bg-purple-950/60 text-purple-300 border-purple-800 text-[11px]">
                                  {c.category}
                                </Badge>
                                {c.isStaffPick && <StaffPickBadge reason={c.staffPickReason} size="sm" />}
                                <LiveStreamBadge status={c.streamStatus} />
                              </div>
                              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px] whitespace-nowrap ml-2">
                                <ShieldCheck className="mr-1 h-3 w-3 inline" /> {c.status}
                              </Badge>
                            </div>

                            <h3 className="text-xl font-bold text-zinc-100 group-hover:text-purple-300 transition-colors">
                              {c.title}
                            </h3>
                            <CharityBadge badge={c.charityBadge} />
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
          }}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-700 px-6 py-12 text-center">
          <Trees className="mx-auto h-8 w-8 text-zinc-500" />
          <h2 className="mt-3 text-lg font-semibold text-zinc-100">No campaigns match these filters</h2>
          <p className="mt-1 text-sm text-zinc-400">Try another species or region, or show all campaigns.</p>
          <Button
            variant="outline"
            className="mt-4 border-zinc-700 text-zinc-200"
            onClick={() => {
              setTreeSpecies("All");
              setRegion("All");
              setSelectedCategories([]);
              setSelectedTags([]);
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
