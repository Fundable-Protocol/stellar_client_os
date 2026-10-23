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
import { DISCOVERY_STAGES, DISCOVERY_FUNDING_MODELS, DISCOVERY_CURRENCIES, DISCOVERY_TIME_WINDOWS } from "@/lib/campaign-discovery-filters";

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
            <Button className="bg-gradient-to-r from-purple-600 to-blue-600 font-semibold text-white hover:from-purple-700 hover:to-blue-700 shadow-lg shadow-purple-900/30">
              <Plus className="mr-2 h-4 w-4" /> Create Campaign Wizard (#720)
            </Button>
          </Link>
        </div>

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
              {availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
