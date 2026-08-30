"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Heart,
  Users,
  Target,
  Calendar,
  Share2,
  Edit,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CampaignSponsorWall } from "@/components/modules/campaign/sponsor-wall/CampaignSponsorWall";
import { CampaignCollaboration } from "@/components/modules/campaign/collaboration/CampaignCollaboration";

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState("overview");

  // Mock campaign record data
  const campaign = {
    id: id || "camp-101",
    title: "Save the Amazon RainForest Reserve",
    category: "Environmental & Reforestation",
    creator: "GD6W...X892",
    shortDescription: "Protecting 50,000 hectares of primary rainforest through community-led guardianship and carbon streaming.",
    fullStory: "The Amazon RainForest Reserve project empowers indigenous communities to monitor, protect, and restore critical wildlife corridors. Funds raised are locked in transparent Stellar payment streams for anti-poaching operations, satellite mapping, and sustainable agriculture.",
    goalAmount: "50,000",
    raisedAmount: "33,850",
    token: "XLM",
    status: "ACTIVE",
    startDate: "2026-08-01",
    endDate: "2026-10-31",
    impactStatement: "Permanently offset 150 metric tons of CO2 while securing habitat for 200+ endangered species.",
    beneficiaries: "5,000 local indigenous community members",
    co2OffsetTons: "150",
  };

  const progressPct = Math.min(100, Math.round((parseFloat(campaign.raisedAmount) / parseFloat(campaign.goalAmount)) * 100));

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      {/* Navigation Top */}
      <div className="flex items-center justify-between">
        <Link
          href="/campaigns"
          className="inline-flex items-center text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Campaigns Directory
        </Link>

        <div className="flex items-center gap-2">
          <Link href="/campaigns/create">
            <Button size="sm" variant="outline" className="border-purple-600/40 text-purple-300 hover:bg-purple-950/40 text-xs">
              <Edit className="mr-1.5 h-3.5 w-3.5" /> Edit Campaign
            </Button>
          </Link>
        </div>
      </div>

      {/* Hero Banner Header */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-r from-zinc-900 via-purple-950/20 to-zinc-900 p-6 md:p-8 shadow-2xl">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2.5">
              <Badge className="bg-purple-600 text-white font-semibold text-xs">{campaign.category}</Badge>
              <Badge variant="outline" className="border-emerald-500 text-emerald-400 text-xs font-semibold">
                <ShieldCheck className="mr-1 h-3 w-3" /> {campaign.status}
              </Badge>
            </div>

            <h1 className="text-3xl font-extrabold text-zinc-50 tracking-tight">{campaign.title}</h1>
            <p className="text-sm text-zinc-300 leading-relaxed">{campaign.shortDescription}</p>

            <div className="flex items-center gap-4 text-xs text-zinc-400 pt-2">
              <span>Created by: <strong className="text-zinc-200 font-mono">{campaign.creator}</strong></span>
              <span>Ends: <strong className="text-zinc-200">{campaign.endDate}</strong></span>
            </div>
          </div>

          {/* Raise Goal Card */}
          <div className="w-full md:w-80 rounded-xl border border-zinc-800 bg-zinc-950/80 p-5 space-y-4 shadow-xl">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-zinc-400">Total Raised</span>
              <span className="text-xs font-bold text-emerald-400">{progressPct}% Funded</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-zinc-50">{campaign.raisedAmount}</span>
              <span className="text-sm font-semibold text-purple-400">{campaign.token}</span>
              <span className="text-xs text-zinc-500">/ {campaign.goalAmount}</span>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <Button className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 font-bold text-white hover:from-emerald-700 hover:to-teal-700 shadow-md">
              <Heart className="mr-2 h-4 w-4 fill-white" /> Sponsor This Campaign
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Tabs (Overview, Sponsor Wall #724, Co-Creators #722) */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
          <TabsTrigger value="overview" className="text-xs font-semibold data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            <Target className="mr-1.5 h-4 w-4" /> Overview & Story
          </TabsTrigger>
          <TabsTrigger value="sponsors" className="text-xs font-semibold data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            <Heart className="mr-1.5 h-4 w-4 text-rose-400" /> Sponsor Wall (#724)
          </TabsTrigger>
          <TabsTrigger value="collaboration" className="text-xs font-semibold data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            <Users className="mr-1.5 h-4 w-4 text-purple-400" /> Co-Creators (#722)
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-3">
                <h3 className="text-lg font-bold text-zinc-100">Full Campaign Story</h3>
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">{campaign.fullStory}</p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-3">
                <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-400" /> Impact Statement & Beneficiaries
                </h3>
                <p className="text-sm text-amber-200/90 italic bg-amber-950/20 p-4 rounded-lg border border-amber-900/30">
                  "{campaign.impactStatement}"
                </p>
                <div className="grid grid-cols-2 gap-4 text-xs pt-2">
                  <div>Beneficiaries: <strong className="text-zinc-100">{campaign.beneficiaries}</strong></div>
                  <div>Estimated CO2 Offset: <strong className="text-amber-400 font-bold">{campaign.co2OffsetTons} Tons</strong></div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">Campaign Timeline</h4>
                <div className="text-xs space-y-2">
                  <div className="flex justify-between border-b border-zinc-800 pb-2">
                    <span className="text-zinc-400">Start Date</span>
                    <strong className="text-zinc-100">{campaign.startDate}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">End Date</span>
                    <strong className="text-zinc-100">{campaign.endDate}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Sponsor Wall (#724) */}
        <TabsContent value="sponsors">
          <CampaignSponsorWall campaignId={campaign.id} campaignTitle={campaign.title} />
        </TabsContent>

        {/* Tab 3: Co-Creators Collaboration (#722) */}
        <TabsContent value="collaboration">
          <CampaignCollaboration campaignId={campaign.id} campaignTitle={campaign.title} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
