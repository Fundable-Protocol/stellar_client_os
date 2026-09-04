"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Pause,
  Play,
  Share2,
  ShieldCheck,
  Trees,
  Clock,
  User,
  MapPin,
  Coins,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import LiveTreeCounter from "./LiveTreeCounter";
import AnimatedProgressBar from "./AnimatedProgressBar";
import { CampaignData, CampaignStatus } from "@/types/campaign";

interface CampaignDetailProps {
  campaignId: string;
}

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
          <button className="p-2 rounded-xl bg-slate-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200">
            <Share2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Action Alert Banner */}
      {actionMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
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
              🌲 {campaign.treeType} Species
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
        <div className="lg:col-span-5">
          <LiveTreeCounter
            treesPlanted={campaign.treesPlanted}
            targetTrees={campaign.targetTrees}
            costPerTree={campaign.costPerTree}
            treeType={campaign.treeType}
          />
        </div>

        {/* Animated Goal Progress Bar (Issue #702) */}
        <div className="lg:col-span-7">
          <AnimatedProgressBar
            totalRaised={totalRaisedNum}
            targetAmount={targetAmountNum}
            minTarget={minTargetNum}
            currencySymbol="XLM"
          />
        </div>
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
