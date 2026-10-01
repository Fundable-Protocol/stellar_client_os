"use client";

import React, { useState } from "react";
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
  Sprout,
  Droplets,
  Bird,
} from "lucide-react";
import LiveTreeCounter from "./LiveTreeCounter";
import AnimatedProgressBar from "./AnimatedProgressBar";
import { CampaignData } from "@/types/campaign";
import { CampaignImpactCalculator } from "@/components/modules/impact/CampaignImpactCalculator";

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
  treeType: id === "2" ? "Aacia" : "Mangrove",
  costPerTree: 10,
  treesPlanted: 725,
  targetTrees: 1000,
  createdAt: Date.now() / 1000 - 86400 * 10,
  deadline: Date.now() / 1000 + 86400 * 20,
  location: "Amazon Basin, South America",
  countries: id === "2" ? ["Kenya", "Tanzania", "Uganda"] : ["Brazil", "Peru", "Colombia"],
});

interface SustainabilityScoreInputs {
  treeSpeciesDiversity: number;
  regionClimateImpact: number;
  soilHealthImprovement: number;
  biodiversityPotential: number;
}

interface SustainabilityScoreResult {
  total: number;
  grade: "A" | "B" | "C" | "D";
  label: string;
  color: string;
  breakdown: {
    key: keyof SustainabilityScoreInputs;
    label: string;
    weight: number;
    value: number;
    contribution: number;
  }[];
}

const SUSTAINABILITY_WEIGHTS: Record<keyof SustainabilityScoreInputs, number> = {
  treeSpeciesDiversity: 0.25,
  regionClimateImpact: 0.3,
  soilHealthImprovement: 0.2,
  biodiversityPotential: 0.25,
};

const SUSTAINABILITY_LABELS: Record<keyof SustainabilityScoreInputs, string> = {
  treeSpeciesDiversity: "Tree Species Diversity",
  regionClimateImpact: "Region Climate Impact",
  soilHealthImprovement: "Soil Health Improvement",
  biodiversityPotential: "Biodiversity Potential",
};

const clampScore = (value: number): number => {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const computeSustainabilityScore = (
  inputs: SustainabilityScoreInputs
): SustainabilityScoreResult => {
  const breakdown = (
    Object.keys(SUSTAINABILITY_WEIGHTS) as (keyof SustainabilityScoreInputs)[]
  ).map((key) => {
    const value = clampScore(inputs[key]);
    const weight = SUSTAINABILITY_WEIGHTS[key];
    return {
      key,
      label: SUSTAINABILITY_LABELS[key],
      weight,
      value,
      contribution: value * weight,
    };
  });

  const total = Math.round(
    breakdown.reduce((sum, item) => sum + item.contribution, 0)
  );

  let grade: SustainabilityScoreResult["grade"] = "D";
  let label = "Needs Improvement";
  let color = "text-rose-400";

  if (total >= 85) {
    grade = "A";
    label = "Excellent Sustainability";
    color = "text-emerald-400";
  } else if (total >= 70) {
    grade = "B";
    label = "Strong Sustainability";
    color = "text-lime-400";
  } else if (total >= 50) {
    grade = "C";
    label = "Moderate Sustainability";
    color = "text-amber-400";
  }

  return { total, grade, label, color, breakdown };
};

const getSustainabilityInputs = (campaign: CampaignData): SustainabilityScoreInputs => {
  const diversityBySpecies: Record<string, number> = {
    Mangrove: 82,
    Acacia: 68,
    Oak: 74,
    Pine: 60,
    "General Fund": 55,
  };

  const regionClimateByLocation: Record<string, number> = {
    "Amazon Basin, South America": 92,
    "Sub-Saharan Africa": 85,
    "Southeast Asia": 88,
  };

  const speciesDiversity = diversityBySpecies[campaign.treeType] ?? 65;
  const regionClimate =
    regionClimateByLocation[campaign.location] ?? 70;
  const soilHealth = clampScore(
    55 + (campaign.treesPlanted / Math.max(campaign.targetTrees, 1)) * 40
  );
  const biodiversity = clampScore(
    speciesDiversity * 0.6 + regionClimate * 0.4
  );

  return {
    treeSpeciesDiversity: speciesDiversity,
    regionClimateImpact: regionClimate,
    soilHealthImprovement: soilHealth,
    biodiversityPotential: biodiversity,
  };
};

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
  const countries = campaign.countries ?? [];
  const geographicDiversityBonus = countries.length > 1;

  const sustainabilityInputs = getSustainabilityInputs(campaign);
  const sustainabilityScore = computeSustainabilityScore(sustainabilityInputs);

  return (
    <main className="w-full space-y-6" aria-labelledby="campaign-detail-title">
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
            type="button"
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
              className={`px-3 py-1 rounded-full texe-xs font-bold uppercase tracking-wider ${ compaign.status === "Active"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : campaign.status === "Paused"
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                  : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
              }`}
            >
              Status: {campaign.status}
            </span>

            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-800/80 text-zinc-300 border border-zinc-700/50">
              {campaign.treeType === "General Fund" ? "💰 General Fund" : `🌰 ${campaign.treeType} Species`}
            </span>

            {geographicDiversityBonus && (
              <span className="px-3 py-1 rounded-full texe-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/40">
                🌍 1.2x Geographic Diversity Bonus
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <MapPin className="size-3.5 text-emerald-400" />
            <span>{campaign.location}</span>
          </div>
        </div>

{countries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
            <span className="font-semibold text-emerald-400">Countries:</span>
            {countries.map((country) => (
              <span key={country} className="px-2.5 py-0.5 rounded-full bg-zinc-800/70 border border-zinc-700/50 text-zinc-200">
                {country}
              </span>
            ))}
          </div>
        )}

        <h1 id="campaign-detail-title" className="text-2xl sm:text-4xl font-black text-white tracking-tight">
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
                <h4 className="texe-xs font-bold text-zinc-200">Campaign Creator Management</h4>
                <p className="text-[11px] text-zinc-400">
                  Pause or resume accepting sponsorships on-chain.
                </p>
              </div>
            </div>

            <button
              type="button"
              aria-label={campaign.status === "Active" ? "Pause fundraising" : "Resume fundraising"}
              onClick={togglePauseResume}
              className={` inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${ campaign.status === "Active"
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" aria-label="Campaign impact summary">
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

      {/* Campaign Impact Calculator (v2) */}
      <div className="w-full">
        <CampaignImpactCalculator 
          campaignSpeciesId={campaign.treeType} 
          campaignTreeCount={campaign.treesPlanted}
          readOnly={true} 
        />
      </div>

      {/* Issue: Campaign Sustainability Score - Environmental Index */}
      <div className="rounded-2xl bg-slate-900/90 border border-zinc-800 p-6 sm:p-8 backdrop-blur-md space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <Leaf className="size-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Sustainability Score
              </h2>
              <p className="text-xs text-zinc-400">
                Environmental index based on species diversity, climate impact, soil health, and biodiversity.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`text-4xl font-black tabular-nums ${sustainabilityScore.color}`}
              aria-label={`Sustainability score ${sustainabilityScore.total} out of 100`}
            >
              {sustainabilityScore.total}
              <span className="text-base font-semibold text-zinc-500">/100</span>
            </div>
            <div className="flex flex-col items-end">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  sustainabilityScore.grade === "A"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : sustainabilityScore.grade === "B"
                    ? "bg-lime-500/10 text-lime-400 border-lime-500/30"
                    : sustainabilityScore.grade === "C"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                }`}
              >
                Grade {sustainabilityScore.grade}
              </span>
              <span className="text-[11px] text-zinc-400 mt-1">
                {sustainabilityScore.label}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sustainabilityScore.breakdown.map((item) => {
            const Icon =
              item.key === "treeSpeciesDiversity"
                ? Sprout
                : item.key === "regionClimateImpact"
                ? Leaf
                : item.key === "soilHealthImprovement"
                ? Droplets
                : Bird;

            return (
              <div
                key={item.key}
                className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-zinc-200">
                      {item.label}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-zinc-100 tabular-nums">
                    {Math.round(item.value)}
                    <span className="text-zinc-500 font-medium">/100</span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all duration-700"
                    style={{ width: `${Math.round(item.value)}%` }}
                    role="progressbar"
                    aria-valuenow={Math.round(item.value)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${item.label} score`}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Weight {Math.round(item.weight * 100)}%</span>
                  <span className="tabular-nums">
                    +{item.contribution.toFixed(1)} pts
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contract & Campaign Specs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-slate-900/90 border border-zinc-800 p-5 space-y2">
          <div className="flex items-center gap-2 text-zinc-400 texe-xs">
            <User className="size-4 text-emerald-400" />
            <span>Campaign Creator</span>
          </div>
          <p className="font-mono text-sm font-bold text-zinc-100 truncate">
            {campaign.creator}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-zinc-800 p-5 space-y2">
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <Coins className="size-4 text-emerald-400" />
            <span>Funding Asset Token</span>
          </div>
          <p className="font-mono text-sm font-bold text-zinc-100">
            Stellar XLM (Native Stroops)
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-zinc-800 p-5 space-y2">
          <div className="flex items-center gap-2 text-zinc-400 texe-xs">
            <Clock className="size-4 text-emerald-400" />
            <span>Campaign Deadline</span>
          </div>
          <p className="font-mono text-sm font-bold text-zinc-100">
            {new Date(campaign.deadline * 1000).toLocaleDateString()}
          </p>
        </div>
      </div>
    </main>
  );
};

export default CampaignDetail;
