"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  Trees,
  ArrowUpDown,
  XCircle,
  Play,
  Pause,
  CheckCircle,
  AlertCircle,
  Clock,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { CampaignData, CampaignFilterOptions, CampaignStatus, TreeType } from "@/types/campaign";

// Sample initial campaign records for demonstration & discovery
const INITIAL_CAMPAIGNS: CampaignData[] = [
  {
    id: "1",
    title: "Amazon Rainforest Reforestation Initiative",
    description: "Restoring native canopy cover in the western Amazon basin through community tree planting.",
    creator: "GBREAKER1...378",
    token: "XLM",
    targetAmount: "10000",
    minTarget: "5000",
    totalRaised: "7250",
    status: "Active",
    treeType: "Mangrove",
    costPerTree: 10,
    treesPlanted: 725,
    targetTrees: 1000,
    createdAt: Date.now() / 1000 - 86400 * 10,
    deadline: Date.now() / 1000 + 86400 * 20,
    location: "Brazil / Peru Basin",
  },
  {
    id: "2",
    title: "Sub-Saharan Acacia Agroforestry Expansion",
    description: "Planting drought-resistant Acacia trees to fight desertification and enrich local soil health.",
    creator: "GVET01...941",
    token: "XLM",
    targetAmount: "25000",
    minTarget: "10000",
    totalRaised: "18500",
    status: "Paused",
    treeType: "Acacia",
    costPerTree: 15,
    treesPlanted: 1233,
    targetTrees: 1666,
    createdAt: Date.now() / 1000 - 86400 * 15,
    deadline: Date.now() / 1000 + 86400 * 15,
    location: "Kenya & Ethiopia border",
  },
  {
    id: "3",
    title: "Pacific Coast Mangrove Restoration",
    description: "Establishing vital coastal mangrove buffers to protect ecosystems and capture carbon.",
    creator: "GCOAST2...112",
    token: "XLM",
    targetAmount: "15000",
    minTarget: "7500",
    totalRaised: "15000",
    status: "Successful",
    treeType: "Mangrove",
    costPerTree: 12,
    treesPlanted: 1250,
    targetTrees: 1250,
    createdAt: Date.now() / 1000 - 86400 * 30,
    deadline: Date.now() / 1000 - 86400 * 2,
    location: "Southeast Asia Coastal Region",
  },
  {
    id: "4",
    title: "Alpine Cedar & Oak Habitat Preservation",
    description: "Expanding high-altitude Cedar and Oak habitats to preserve indigenous wildlife biodiversity.",
    creator: "GALPINE8...663",
    token: "XLM",
    targetAmount: "8000",
    minTarget: "4000",
    totalRaised: "1200",
    status: "Failed",
    treeType: "Cedar",
    costPerTree: 20,
    treesPlanted: 60,
    targetTrees: 400,
    createdAt: Date.now() / 1000 - 86400 * 45,
    deadline: Date.now() / 1000 - 86400 * 5,
    location: "European Alpine Ridge",
  },
  {
    id: "5",
    title: "Community Fruit Orchards & Food Security",
    description: "Sponsoring sustainable fruit tree orchards for rural communities to ensure long-term food sovereignty.",
    creator: "GORCHARD5...449",
    token: "XLM",
    targetAmount: "30000",
    minTarget: "15000",
    totalRaised: "30000",
    status: "Claimed",
    treeType: "Fruit Tree",
    costPerTree: 25,
    treesPlanted: 1200,
    targetTrees: 1200,
    createdAt: Date.now() / 1000 - 86400 * 60,
    deadline: Date.now() / 1000 - 86400 * 12,
    location: "Central America",
  },
  {
    id: "6",
    title: "Ancient Baobab Conservation Trust",
    description: "Protecting keystone Baobab species through targeted tree propagation and local stewardship.",
    creator: "GBAOBAB7...881",
    token: "XLM",
    targetAmount: "50000",
    minTarget: "20000",
    totalRaised: "41000",
    status: "Active",
    treeType: "Baobab",
    costPerTree: 50,
    treesPlanted: 820,
    targetTrees: 1000,
    createdAt: Date.now() / 1000 - 86400 * 5,
    deadline: Date.now() / 1000 + 86400 * 25,
    location: "Madagascar",
  },
];

const TREE_TYPES: TreeType[] = [
  "Oak",
  "Mangrove",
  "Pine",
  "Acacia",
  "Cedar",
  "Fruit Tree",
  "Baobab",
  "Redwood",
  "Birch",
];

const STATUS_LIST: (CampaignStatus | "All")[] = [
  "All",
  "Active",
  "Paused",
  "Successful",
  "Failed",
  "Claimed",
];

export const CampaignSearch: React.FC = () => {
  const [filters, setFilters] = useState<CampaignFilterOptions>({
    searchQuery: "",
    status: "All",
    treeType: "All",
    progressRange: "All",
    sortBy: "trending",
  });

  const filteredCampaigns = useMemo(() => {
    return INITIAL_CAMPAIGNS.filter((campaign) => {
      // 1. Text Search query filter
      if (filters.searchQuery.trim() !== "") {
        const query = filters.searchQuery.toLowerCase();
        const matchesTitle = campaign.title.toLowerCase().includes(query);
        const matchesDesc = campaign.description.toLowerCase().includes(query);
        const matchesCreator = campaign.creator.toLowerCase().includes(query);
        const matchesTree = campaign.treeType.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesCreator && !matchesTree) {
          return false;
        }
      }

      // 2. Status filter
      if (filters.status !== "All" && campaign.status !== filters.status) {
        return false;
      }

      // 3. Tree type filter
      if (filters.treeType !== "All" && campaign.treeType !== filters.treeType) {
        return false;
      }

      // 4. Progress range filter
      const raised = Number(campaign.totalRaised);
      const target = Number(campaign.targetAmount);
      const progress = target > 0 ? (raised / target) * 100 : 0;

      if (filters.progressRange === "0-25%" && (progress < 0 || progress > 25)) {
        return false;
      }
      if (filters.progressRange === "25-50%" && (progress < 25 || progress > 50)) {
        return false;
      }
      if (filters.progressRange === "50-75%" && (progress < 50 || progress > 75)) {
        return false;
      }
      if (filters.progressRange === "75-100%" && (progress < 75 || progress > 100)) {
        return false;
      }
      if (filters.progressRange === "100%+" && progress < 100) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      const progressA = (Number(a.totalRaised) / Number(a.targetAmount)) * 100;
      const progressB = (Number(b.totalRaised) / Number(b.targetAmount)) * 100;

      if (filters.sortBy === "progress") {
        return progressB - progressA;
      }
      if (filters.sortBy === "target") {
        return Number(b.targetAmount) - Number(a.targetAmount);
      }
      if (filters.sortBy === "newest") {
        return b.createdAt - a.createdAt;
      }
      // default trending
      return progressB - progressA;
    });
  }, [filters]);

  const resetFilters = () => {
    setFilters({
      searchQuery: "",
      status: "All",
      treeType: "All",
      progressRange: "All",
      sortBy: "trending",
    });
  };

  const getStatusBadge = (status: CampaignStatus) => {
    switch (status) {
      case "Active":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Play className="size-3 fill-emerald-400" /> Active
          </span>
        );
      case "Paused":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Pause className="size-3 fill-amber-400" /> Paused
          </span>
        );
      case "Successful":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <CheckCircle className="size-3" /> Successful
          </span>
        );
      case "Failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertCircle className="size-3" /> Expired
          </span>
        );
      case "Claimed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <CheckCircle className="size-3" /> Claimed
          </span>
        );
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header Banner */}
      <div className="relative rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-zinc-900 p-6 sm:p-8 border border-emerald-500/20 shadow-xl overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Trees className="size-64 text-emerald-400" />
        </div>
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="size-3.5" />
            <span>Fundable Protocol Explorer</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Explore Tree Reforestation Campaigns
          </h1>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Search and filter active campaigns by lifecycle status, target tree species, or progress milestones. Sponsor real-world environmental impact on Stellar.
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="rounded-2xl bg-slate-900/80 border border-zinc-800 p-4 sm:p-6 backdrop-blur-md space-y-4 shadow-lg">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="relative md:col-span-6">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by campaign title, creator, or keyword..."
              value={filters.searchQuery}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
              }
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-700/60 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
            />
            {filters.searchQuery && (
              <button
                onClick={() => setFilters((prev) => ({ ...prev, searchQuery: "" }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                <XCircle className="size-4" />
              </button>
            )}
          </div>

          {/* Tree Type Select Filter */}
          <div className="md:col-span-3">
            <select
              value={filters.treeType}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  treeType: e.target.value as TreeType | "All",
                }))
              }
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-700/60 text-zinc-200 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="All">🌳 All Tree Types</option>
              {TREE_TYPES.map((tree) => (
                <option key={tree} value={tree}>
                  {tree}
                </option>
              ))}
            </select>
          </div>

          {/* Progress Range Filter */}
          <div className="md:col-span-3">
            <select
              value={filters.progressRange}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  progressRange: e.target.value as CampaignFilterOptions["progressRange"],
                }))
              }
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-700/60 text-zinc-200 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="All">📊 All Progress Levels</option>
              <option value="0-25%">0% – 25% Funded</option>
              <option value="25-50%">25% – 50% Funded</option>
              <option value="50-75%">50% – 75% Funded</option>
              <option value="75-100%">75% – 100% Funded</option>
              <option value="100%+">100%+ Fully Funded</option>
            </select>
          </div>
        </div>

        {/* Status Pills & Sort Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-zinc-400 mr-1 flex items-center gap-1">
              <Filter className="size-3.5" /> Status:
            </span>
            {STATUS_LIST.map((status) => (
              <button
                key={status}
                onClick={() => setFilters((prev) => ({ ...prev, status }))}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  filters.status === status
                    ? "bg-emerald-500 text-zinc-950 font-bold shadow-md shadow-emerald-500/20"
                    : "bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60 border border-zinc-700/40"
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-zinc-400">
              <ArrowUpDown className="size-3.5" /> Sort:
            </div>
            <select
              value={filters.sortBy}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  sortBy: e.target.value as CampaignFilterOptions["sortBy"],
                }))
              }
              className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs focus:outline-none focus:border-emerald-500"
            >
              <option value="trending">🔥 Trending First</option>
              <option value="progress">📈 Highest Progress</option>
              <option value="target">💰 Highest Target</option>
              <option value="newest">✨ Newest First</option>
            </select>

            {(filters.searchQuery ||
              filters.status !== "All" ||
              filters.treeType !== "All" ||
              filters.progressRange !== "All") && (
              <button
                onClick={resetFilters}
                className="px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 font-medium underline ml-2"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Count Bar */}
      <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
        <span>
          Showing <strong className="text-zinc-200">{filteredCampaigns.length}</strong> campaigns
        </span>
        <span>Connected Network: Stellar Testnet</span>
      </div>

      {/* Campaign Cards Grid */}
      {filteredCampaigns.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-slate-900/50 p-12 text-center space-y-3">
          <Trees className="size-12 text-zinc-600 mx-auto" />
          <h3 className="text-base font-bold text-zinc-200">No campaigns found</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            No campaigns matched your current search filters. Try clearing your search query or selecting a different status/tree type.
          </p>
          <button
            onClick={resetFilters}
            className="mt-2 px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 text-xs font-bold hover:bg-emerald-400 transition-colors"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCampaigns.map((campaign) => {
            const raised = Number(campaign.totalRaised);
            const target = Number(campaign.targetAmount);
            const percent = Math.min(100, Math.round((raised / target) * 100));

            return (
              <div
                key={campaign.id}
                className="group relative rounded-2xl bg-slate-900/90 border border-zinc-800 p-5 shadow-lg backdrop-blur-md transition-all duration-300 hover:border-emerald-500/40 hover:shadow-emerald-500/5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Status & Tree Tag */}
                  <div className="flex items-center justify-between">
                    {getStatusBadge(campaign.status)}
                    <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20">
                      🌲 {campaign.treeType}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-base font-bold text-zinc-100 group-hover:text-emerald-400 transition-colors line-clamp-1">
                      {campaign.title}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                      {campaign.description}
                    </p>
                  </div>

                  {/* Trees Planted Badge */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs">
                    <span className="text-zinc-400">Trees Impact:</span>
                    <span className="font-bold text-zinc-200">
                      {campaign.treesPlanted.toLocaleString()} / {campaign.targetTrees.toLocaleString()} Trees
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-400">Raised: {raised.toLocaleString()} XLM</span>
                      <span className="text-emerald-400">{percent}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="pt-4 mt-4 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <Clock className="size-3" /> ID: #{campaign.id}
                  </span>

                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 group-hover:translate-x-0.5 transition-all"
                  >
                    View Detail <ChevronRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CampaignSearch;
