"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Scale,
  Plus,
  X,
  Star,
  CheckCircle2,
  Calendar,
  DollarSign,
  Users,
  Award,
  ChevronRight,
  TrendingUp,
  Clock,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface CampaignTier {
  id: string;
  name: string;
  amount: string;
  token: string;
  perks: string[];
  claimed: number;
  limit: number;
}

export interface CompareCampaign {
  id: string;
  title: string;
  category: string;
  description: string;
  raisedAmount: number;
  goalAmount: number;
  token: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  milestonesCount: number;
  milestonesCompleted: number;
  creator: {
    name: string;
    avatar?: string;
    verified: boolean;
    rating: number;
    reviewsCount: number;
    completedProjects: number;
  };
  backerCount: number;
  averagePledge: number;
  rewardTiers: CampaignTier[];
}

export const MOCK_CAMPAIGNS_POOL: CompareCampaign[] = [
  {
    id: "camp-101",
    title: "Save the Amazon RainForest Reserve",
    category: "Environmental & Reforestation",
    description: "Protecting 50,000 hectares of primary rainforest through community-led guardianship and carbon streaming.",
    raisedAmount: 33850,
    goalAmount: 50000,
    token: "XLM",
    startDate: "2026-08-01",
    endDate: "2026-09-15",
    daysRemaining: 15,
    milestonesCount: 5,
    milestonesCompleted: 3,
    creator: {
      name: "EcoGuardiansDAO",
      verified: true,
      rating: 4.9,
      reviewsCount: 128,
      completedProjects: 8,
    },
    backerCount: 412,
    averagePledge: 82.16,
    rewardTiers: [
      {
        id: "t1",
        name: "Rainforest Guardian",
        amount: "50",
        token: "XLM",
        perks: ["Digital Certificate", "Tree Plot NFT", "Monthly Impact Report"],
        claimed: 150,
        limit: 200,
      },
      {
        id: "t2",
        name: "Biotope Protector",
        amount: "250",
        token: "XLM",
        perks: ["Naming rights to 1 Hectare", "Exclusive Discord Access", "On-chain Governance Voting"],
        claimed: 45,
        limit: 50,
      },
    ],
  },
  {
    id: "camp-102",
    title: "Clean Water Wells for Sub-Saharan Communities",
    category: "Community & Social Impact",
    description: "Installing 12 solar-powered water filtration wells across rural farming villages.",
    raisedAmount: 18200,
    goalAmount: 25000,
    token: "USDC",
    startDate: "2026-07-20",
    endDate: "2026-09-05",
    daysRemaining: 5,
    milestonesCount: 4,
    milestonesCompleted: 2,
    creator: {
      name: "AquaPure Global",
      verified: true,
      rating: 4.7,
      reviewsCount: 84,
      completedProjects: 5,
    },
    backerCount: 290,
    averagePledge: 62.75,
    rewardTiers: [
      {
        id: "t1",
        name: "Water Supporter",
        amount: "25",
        token: "USDC",
        perks: ["Supporter Badge", "Email Updates"],
        claimed: 120,
        limit: 300,
      },
      {
        id: "t2",
        name: "Well Sponsor",
        amount: "500",
        token: "USDC",
        perks: ["Plaque Inscription", "VIP Field Trip Invite", "Quarterly Water Quality Audits"],
        claimed: 12,
        limit: 15,
      },
    ],
  },
  {
    id: "camp-103",
    title: "Stellar Developer Academy & Bootcamp",
    category: "Education & Open Source",
    description: "Free 12-week intensive Soroban smart contract development bootcamp for African creators.",
    raisedAmount: 45000,
    goalAmount: 40000,
    token: "USDC",
    startDate: "2026-08-10",
    endDate: "2026-09-25",
    daysRemaining: 25,
    milestonesCount: 6,
    milestonesCompleted: 4,
    creator: {
      name: "StellarDev Hub",
      verified: true,
      rating: 5.0,
      reviewsCount: 210,
      completedProjects: 12,
    },
    backerCount: 650,
    averagePledge: 69.23,
    rewardTiers: [
      {
        id: "t1",
        name: "Scholarship Patron",
        amount: "100",
        token: "USDC",
        perks: ["Student Sponsor Badge", "Access to Demo Day", "NFT Certificate"],
        claimed: 300,
        limit: 500,
      },
      {
        id: "t2",
        name: "Core Ecosystem Partner",
        amount: "1000",
        token: "USDC",
        perks: ["Keynote Speaker Slot", "Talent Pool Direct Hire", "Logo on Certificate"],
        claimed: 8,
        limit: 10,
      },
    ],
  },
  {
    id: "camp-104",
    title: "Decentralized Solar Mesh Grid for Island Communities",
    category: "Clean Energy & Hardware",
    description: "Building micro-solar energy grids with smart meters connected to the Stellar blockchain for peer-to-peer energy trade.",
    raisedAmount: 12500,
    goalAmount: 30000,
    token: "XLM",
    startDate: "2026-08-15",
    endDate: "2026-10-01",
    daysRemaining: 31,
    milestonesCount: 5,
    milestonesCompleted: 1,
    creator: {
      name: "Helios Grid Co",
      verified: false,
      rating: 4.5,
      reviewsCount: 32,
      completedProjects: 2,
    },
    backerCount: 140,
    averagePledge: 89.28,
    rewardTiers: [
      {
        id: "t1",
        name: "Solar Pioneer",
        amount: "75",
        token: "XLM",
        perks: ["Kilowatt Credit Token", "Dashboard Monitoring"],
        claimed: 80,
        limit: 150,
      },
    ],
  },
];

export function CampaignComparisonTool() {
  const [selectedIds, setSelectedIds] = useState<string[]>(["camp-101", "camp-102", "camp-103"]);

  const selectedCampaigns = selectedIds
    .map((id) => MOCK_CAMPAIGNS_POOL.find((c) => c.id === id))
    .filter((c): c is CompareCampaign => c !== undefined);

  const availableToSelect = MOCK_CAMPAIGNS_POOL.filter((c) => !selectedIds.includes(c.id));

  const addCampaign = (id: string) => {
    if (selectedIds.length < 3) {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const removeCampaign = (id: string) => {
    setSelectedIds(selectedIds.filter((item) => item !== id));
  };

  // Metric highlights calculations
  const maxRaised = Math.max(...selectedCampaigns.map((c) => (c.raisedAmount / c.goalAmount) * 100), 0);
  const maxBackers = Math.max(...selectedCampaigns.map((c) => c.backerCount), 0);
  const maxRating = Math.max(...selectedCampaigns.map((c) => c.creator.rating), 0);

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-purple-950/80 text-purple-300 border-purple-800 text-xs">
              Feature #778
            </Badge>
            <span className="text-xs text-zinc-400">Side-by-side metric analytics</span>
          </div>
          <h1 className="text-3xl font-extrabold text-zinc-50 tracking-tight flex items-center gap-3">
            <Scale className="h-8 w-8 text-purple-400" />
            Campaign Comparison Tool
          </h1>
          <p className="mt-1 text-sm text-zinc-400 max-w-2xl">
            Compare up to 3 active campaigns side-by-side across funding progress, timelines, creator ratings, reward tier structures, and backer engagement.
          </p>
        </div>

        {/* Campaign Selector dropdown if slot available */}
        {selectedIds.length < 3 && availableToSelect.length > 0 && (
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-2 rounded-xl">
            <span className="text-xs text-zinc-400 font-medium pl-2">Add Campaign ({selectedIds.length}/3):</span>
            <select
              className="bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
              onChange={(e) => {
                if (e.target.value) {
                  addCampaign(e.target.value);
                  e.target.value = "";
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>
                Select campaign...
              </option>
              {availableToSelect.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {selectedCampaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-12 text-center bg-zinc-900/40">
          <Scale className="mx-auto h-12 w-12 text-zinc-600 mb-3" />
          <h3 className="text-lg font-semibold text-zinc-200">No campaigns selected for comparison</h3>
          <p className="text-sm text-zinc-400 mt-1 mb-4">Select at least one campaign from the pool below to begin side-by-side comparison.</p>
          <div className="flex justify-center gap-2 flex-wrap">
            {MOCK_CAMPAIGNS_POOL.map((c) => (
              <Button key={c.id} variant="outline" size="sm" onClick={() => addCampaign(c.id)} className="border-zinc-700 bg-zinc-900 text-zinc-300">
                <Plus className="mr-1 h-3.5 w-3.5 text-purple-400" /> Add {c.title}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Comparison Matrix Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {selectedCampaigns.map((camp) => {
              const progressPct = Math.round((camp.raisedAmount / camp.goalAmount) * 100);
              const isTopRaised = progressPct === maxRaised && maxRaised > 0;
              const isTopBackers = camp.backerCount === maxBackers && maxBackers > 0;
              const isTopRating = camp.creator.rating === maxRating && maxRating > 0;

              return (
                <div
                  key={camp.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-6 flex flex-col justify-between space-y-6 shadow-xl relative hover:border-purple-500/40 transition-all duration-300"
                >
                  {/* Remove Button */}
                  <button
                    onClick={() => removeCampaign(camp.id)}
                    className="absolute top-4 right-4 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 p-1.5 rounded-lg transition-colors"
                    title="Remove from comparison"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  {/* Campaign Top Meta */}
                  <div className="space-y-3 pr-6">
                    <Badge variant="outline" className="border-purple-500/30 text-purple-300 bg-purple-950/40 text-[10px]">
                      {camp.category}
                    </Badge>
                    <h2 className="text-xl font-bold text-zinc-100 leading-snug line-clamp-2">{camp.title}</h2>
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{camp.description}</p>
                  </div>

                  {/* Section 1: Funding Progress */}
                  <div className="space-y-3 pt-4 border-t border-zinc-800/80">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                        1. Funding Progress
                      </span>
                      {isTopRaised && (
                        <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px]">
                          Highest % Goal
                        </Badge>
                      )}
                    </div>
                    <div className="bg-zinc-950/70 p-3 rounded-lg space-y-2 border border-zinc-800">
                      <div className="flex justify-between items-baseline text-xs">
                        <span className="text-zinc-400">Raised Amount:</span>
                        <span className="font-bold text-zinc-100">
                          {camp.raisedAmount.toLocaleString()} {camp.token}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline text-xs">
                        <span className="text-zinc-400">Target Goal:</span>
                        <span className="text-zinc-400">
                          {camp.goalAmount.toLocaleString()} {camp.token}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 rounded-full"
                          style={{ width: `${Math.min(progressPct, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-emerald-400 font-semibold">{progressPct}% Funded</span>
                        <span className="text-zinc-500">{camp.token} Currency</span>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Timeline */}
                  <div className="space-y-3 pt-4 border-t border-zinc-800/80">
                    <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-blue-400" />
                      2. Timeline & Milestones
                    </span>
                    <div className="bg-zinc-950/70 p-3 rounded-lg space-y-2 border border-zinc-800 text-xs">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Days Remaining:</span>
                        <span className="font-bold text-amber-400 flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {camp.daysRemaining} Days
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-400 text-[11px]">
                        <span>Start: {camp.startDate}</span>
                        <span>End: {camp.endDate}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1 text-[11px] border-t border-zinc-800/60">
                        <span className="text-zinc-400">Milestones Progress:</span>
                        <span className="text-blue-300 font-medium">
                          {camp.milestonesCompleted} of {camp.milestonesCount} Achieved
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Creator Ratings */}
                  <div className="space-y-3 pt-4 border-t border-zinc-800/80">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                        3. Creator Reputation
                      </span>
                      {isTopRating && (
                        <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px]">
                          Top Rated
                        </Badge>
                      )}
                    </div>
                    <div className="bg-zinc-950/70 p-3 rounded-lg space-y-2 border border-zinc-800 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-100 flex items-center gap-1">
                          {camp.creator.name}
                          {camp.creator.verified && (
                            <ShieldCheck className="h-3.5 w-3.5 text-blue-400 inline" title="Verified Creator" />
                          )}
                        </span>
                        <div className="flex items-center gap-1 bg-amber-950/50 px-2 py-0.5 rounded text-amber-300 border border-amber-800/40 text-[11px] font-bold">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {camp.creator.rating.toFixed(1)}
                        </div>
                      </div>
                      <div className="flex justify-between text-zinc-400 text-[11px]">
                        <span>Completed Projects: <strong>{camp.creator.completedProjects}</strong></span>
                        <span>Reviews: {camp.creator.reviewsCount}</span>
                      </div>
                    </div>
                  </div>

                  {/* Section 4: Reward Tiers */}
                  <div className="space-y-3 pt-4 border-t border-zinc-800/80">
                    <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="h-4 w-4 text-purple-400" />
                      4. Reward Tiers ({camp.rewardTiers.length})
                    </span>
                    <div className="space-y-2">
                      {camp.rewardTiers.map((tier) => (
                        <div key={tier.id} className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800 text-xs space-y-1">
                          <div className="flex justify-between items-center font-semibold text-zinc-200">
                            <span>{tier.name}</span>
                            <span className="text-purple-300 font-bold">
                              {tier.amount} {tier.token}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400">{tier.perks.join(" • ")}</p>
                          <div className="text-[10px] text-zinc-500 pt-0.5">
                            Claimed: {tier.claimed} / {tier.limit}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 5: Backer Count */}
                  <div className="space-y-3 pt-4 border-t border-zinc-800/80">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-indigo-400" />
                        5. Backer Engagement
                      </span>
                      {isTopBackers && (
                        <Badge className="bg-indigo-950 text-indigo-300 border-indigo-800 text-[10px]">
                          Most Backers
                        </Badge>
                      )}
                    </div>
                    <div className="bg-zinc-950/70 p-3 rounded-lg space-y-2 border border-zinc-800 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-400">Total Backers:</span>
                        <span className="font-bold text-indigo-300 text-sm">{camp.backerCount} Supporters</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-zinc-400">
                        <span>Average Contribution:</span>
                        <span className="text-zinc-200 font-medium">
                          ${camp.averagePledge.toFixed(2)} {camp.token}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-4 border-t border-zinc-800">
                    <Link href={`/campaigns/${camp.id}`}>
                      <Button className="w-full bg-purple-900/60 text-purple-200 hover:bg-purple-800/80 border border-purple-700/50 text-xs font-semibold">
                        View Campaign Details <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Slot Selector for empty slots */}
          {selectedIds.length < 3 && availableToSelect.length > 0 && (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-4 flex items-center justify-between">
              <span className="text-xs text-zinc-400 flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-400" /> You can compare up to {3 - selectedIds.length} more campaign(s).
              </span>
              <div className="flex gap-2">
                {availableToSelect.map((c) => (
                  <Button key={c.id} size="sm" variant="outline" onClick={() => addCampaign(c.id)} className="border-zinc-700 text-xs bg-zinc-900 text-zinc-300">
                    <Plus className="mr-1 h-3.5 w-3.5 text-purple-400" /> Add {c.title.slice(0, 20)}...
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CampaignComparisonTool;
