"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Pause,
  Play,
  Share2,
  ShieldCheck,
  Clock,
  User,
  MapPin,
  Coins,
  Info,
  Leaf,
} from "lucide-react";
import LiveTreeCounter from "./LiveTreeCounter";
import AnimatedProgressBar from "./AnimatedProgressBar";
import { CampaignData } from "@/types/campaign";
import { CampaignImpactCalculator } from "@/components/modules/impact/CampaignImpactCalculator";

interface CampaignDetailProps {
  campaignId: string;
}

// Tree species diversity scoring (v1)
// Higher species diversity => higher environmental value and carbon credit potential.
export const calculateSpeciesDiversityScore = (species: string[]): number => {
  const normalized = Array.from(
    new Set(
      species
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0 && s !== "general fund")
    )
  );
  const uniqueCount = normalized.length;
  if (uniqueCount === 0) return 0;
  // Shannon-like saturating curve: 1 species => 25, 2 => 50, 3 => 75, 4+ => 100
  const score = Math.min(100, Math.round((uniqueCount / 4) * 100));
  return score;
};

export const getDiversityTier = (score: number): string => {
  if (score >= 85) return "Exceptional";
  if (score >= 60) return "High";
  if (score >= 35) return "Moderate";
  if (score > 0) return "Low";
  return "None";
};

// Sample campaign fallback generator for detail page
const getSampleCampaign = (id: string): CampaignData => ({
  id,
  title: id === "2" ? "Sub-Saharan Acacia Agroforestry Expansion" : "Amazon Rainforest Reforestation Initiative",
  description:
    "This campaign aims to restore degraded native forest canopy, fight soil erosion, and build climate resilience for local ecosystems. Every contribution directly funds saplings, planting labor, and ongoing stewardship.",
  creator: "GBREAKER1...378",
  token: "XLM",
  targetAmount: "10000",
  minTarget: "5000",
  totalRaised: "7250",
  status: id === "2" ? "Paused" : "Active",
  treeType: id === "2" ? "Acacia" : "Mangrove",
  treeSpecies: id === "2" ? ["Acacia", "Baobab", "Moringa"] : ["Mangrove", "Kapok", "Brazil Nut", "Rubber Tree"],
  costPerTree: 10,
  treesPlanted: 725,
  targetTrees: 1000,
  createdAt: Date.now() / 1000 - 86400 * 10,
  deadline: Date.now() / 1000 + 86400 * 20,
  location: "Amazon Basin, South America",
});

export const CampaignDetail: React.FC<CampaignDetailProps> = ({ campaignId }) => {
  const [campaign, setCampaign] = useState<CampaignData>(() =>
    getSampleCampaign(campaignId)
  );
  const [isCreatorMode, setIsCreatorMode] = useState<boolean>(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const speciesList = useMemo<string[]>(() => {
    if (campaign.treeSpecies && campaign.treeSpecies.length > 0) {
      return campaign.treeSpecies;
    }
    return campaign.treeType && campaign.treeType !== "General Fund" ? [campaign.treeType] : [];
  }, [campaign.treeSpecies, campaign.treeType]);

  const diversityScore = useMemo(() => calculateSpeciesDiversityScore(speciesList), [speciesList]);
  const diversityTier = useMemo(() => getDiversityTier(diversityScore), [diversityScore]);

  const togglePauseResume = () => {
    if (campaign.status === "Active") {
      setCampaign((prev) => ({ ...prev, status: "Paused" }));
      setActionMessage("Campaign fundraising has been PAUSED. No new contributions will be accepted until resumed.");
    } else if (campaign.status === "Paused") {
      setCampaign((prev) => ({ ...prev, status: "Active" }));
      setActionMessage("Campaign fundraising has been RESUMED. Contributions are now live!");
    }

    setTimeout(() => setActionMessage(null), 5000);
  };

  const totalRaisedNum = Number(campaign.totalRaised);
  const targetAmountNum = Number(campaign.targetAmount);
  const minTargetNum = Number(campaign.minTarget);

  return (
    <div className="w-full space-y-6">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/campaigns"
          aria-label="Back to Campaigns Explorer"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
        >
          <ArrowLeft className="size-4" /> Back to Campaigns Explorer
        </Link>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCreatorMode((prev) => !prev)}
            className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 font-medium hover:bg-zinc-700 transition-colors"
          >
            Toggle Creator Simulation ({isCreatorMode ? "Creator View" : "Public View"})
          </button>
          <button
            type="button"
            aria-label="Share campaign"
            className="p-2 rounded-xl bg-slate-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            <Share2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Action Alert Banner */}
      {actionMessage && (
        <div
          role="status"
          aria-live="polite"
          className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn"
        >
          <Info className="size-4 text-emerald-400 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Campaign Header & Title Section */}
      <div className="rounded-2xl bg-slate-900/90 border border-zinc-800 p-6 sm:p-8 backdrop-blur-md space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                campaign.status === "Active"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : campaign.status === "Paused"
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                  : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
              }`}
            >
              Status: {campaign.status}
            </span>

            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-800/80 text-zinc-300 border border-zinc-700/50">
              {campaign.treeType === "General Fund" ? "💼 General Fund" : `🌲 ${campaign.treeType} Species`}
            </span>

            <span
              className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
              title="Tree species diversity score (v1)"
            >
              <Leaf className="inline size-3 mr-1 -mt-0.5" />
              Diversity: {diversityScore}/100 ({diversityTier})
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <MapPin className="size-3.5 text-emerald-400" />
            <span>{campaign.location}</span>
          </div>
        </div>

        <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
          {campaign.title}
        </h1>

        <p className="text-sm text-zinc-300 leading-relaxed max-w-3xl">
          {campaign.description}
        </p>

        {/* Creator Controls for Pause / Resume */}
        {isCreatorMode && (
          <div className="mt-4 p-4 rounded-xl bg-zinc-950/80 border border-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-emerald-400" />
              <div>
                <h4 className="text-xs font-bold text-zinc-200">Campaign Creator Management</h4>
                <p className="text-[11px] text-zinc-400">
                  Pause or resume accepting sponsorships on-chain.
                </p>
              </div>
            </div>

            <button
              onClick={togglePauseResume}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
                campaign.status === "Active"
                  ? "bg-amber-500 text-zinc-950 hover:bg-amber-400"
                  : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              }`}
            >
              {campaign.status === "Active" ? (
                <>
                  <Pause className="size-3.5 fill-current" /> Pause Fundraising
                </>
              ) : (
                <>
                  <Play className="size-3.5 fill-current" /> Resume Fundraising
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Issue #702: Live Tree Counter & Animated Progress Bar Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Animated Tree Ticker (Issue #702) */}
        {campaign.treeType !== "General Fund" && (
          <div className="lg:col-span-5">
            <LiveTreeCounter
              treesPlanted={campaign.treesPlanted}
              targetTrees={campaign.targetTrees}
              costPerTree={campaign.costPerTree}
              treeType={campaign.treeType}
            />
          </div>
        )}

        {/* Animated Goal Progress Bar (Issue #702) */}
        <div className={campaign.treeType === "General Fund" ? "lg:col-span-12" : "lg:col-span-7"}>
          <AnimatedProgressBar
            totalRaised={totalRaisedNum}
            targetAmount={targetAmountNum}
            minTarget={minTargetNum}
            currencySymbol="XLM"
          />
        </div>
      </div>

      {/* Issue: Campaign tree species diversity scoring (v1) */}
      <div className="rounded-2xl bg-slate-900/90 border border-zinc-800 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Leaf className="size-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-zinc-100">Tree Species Diversity</h3>
          </div>
          <span className="text-xs font-semibold text-emerald-300">
            {diversityScore}/100 · {diversityTier}
          </span>
        </div>

        <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all"
            style={{ width: `${diversityScore}%` }}
            role="progressbar"
            aria-valuenow={diversityScore}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tree species diversity score"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {speciesList.length > 0 ? (
            speciesList.map((species) => (
              <span
                key={species}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-zinc-800/80 text-zinc-200 border border-zinc-700/60"
              >
                🌱 {species}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-zinc-400">No species data available.</span>
          )}
        </div>

        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Higher species diversity increases ecosystem resilience and potential carbon credit value.
          Score is derived from the number of distinct tree species planted in this campaign.
        </p>
      </div>

      {/* Campaign Impact Calculator (v2) */}
      <div className="w-full">
        <CampaignImpactCalculator 
          campaignSpeciesId={campaign.treeType} 
          campaignTreeCount={campaign.treesPlanted}
          readOnly={true} 
        />
      </div>

      {/* Contract & Campaign Specs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-slate-900/90 border border-zinc-800 p-5 space-y-2">
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <User className="size-4 text-emerald-400" />
            <span>Campaign Creator</span>
          </div>
          <p className="font-mono text-sm font-bold text-zinc-100 truncate">
            {campaign.creator}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-zinc-800 p-5 space-y-2">
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <Coins className="size-4 text-emerald-400" />
            <span>Funding Asset Token</span>
          </div>
          <p className="font-mono text-sm font-bold text-zinc-100">
            Stellar XLM (Native Stroops)
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-zinc-800 p-5 space-y-2">
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <Clock className="size-4 text-emerald-400" />
            <span>Campaign Deadline</span>
          </div>
          <p className="font-mono text-sm font-bold text-zinc-100">
            {new Date(campaign.deadline * 1000).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default CampaignDetail;
