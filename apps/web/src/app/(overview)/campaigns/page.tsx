"use client";

import React from "react";
import Link from "next/link";
import { Rocket, Plus, Heart, Users, Sparkles, ShieldCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function CampaignsDirectoryPage() {
  const campaigns = [
    {
      id: "camp-101",
      title: "Save the Amazon RainForest Reserve",
      category: "Environmental & Reforestation",
      raisedAmount: "33,850",
      goalAmount: "50,000",
      token: "XLM",
      sponsorCount: 6,
      collaboratorCount: 2,
      status: "ACTIVE",
      description: "Protecting 50,000 hectares of primary rainforest through community-led guardianship and carbon streaming.",
    },
    {
      id: "camp-102",
      title: "Clean Water Wells for Sub-Saharan Communities",
      category: "Community & Social Impact",
      raisedAmount: "18,200",
      goalAmount: "25,000",
      token: "USDC",
      sponsorCount: 14,
      collaboratorCount: 3,
      status: "ACTIVE",
      description: "Installing 12 solar-powered water filtration wells across rural farming villages.",
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-50 tracking-tight flex items-center gap-3">
            <Rocket className="h-8 w-8 text-purple-500" />
            Campaigns Dashboard
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Explore active crowdfunding campaigns, sponsor impactful initiatives, or launch a new 5-step wizard campaign.
          </p>
        </div>

        <Link href="/campaigns/create">
          <Button className="bg-gradient-to-r from-purple-600 to-blue-600 font-semibold text-white hover:from-purple-700 hover:to-blue-700 shadow-lg shadow-purple-900/30">
            <Plus className="mr-2 h-4 w-4" /> Create Campaign Wizard (#720)
          </Button>
        </Link>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {campaigns.map((c) => {
          const progress = Math.round((parseFloat(c.raisedAmount.replace(/,/g, "")) / parseFloat(c.goalAmount.replace(/,/g, ""))) * 100);
          return (
            <div
              key={c.id}
              className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl transition-all duration-300 hover:border-purple-500/50 hover:shadow-2xl"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className="bg-purple-950/60 text-purple-300 border-purple-800 text-[11px]">
                    {c.category}
                  </Badge>
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
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
                  <span className="text-zinc-400">Raised: <strong className="text-zinc-100 font-bold">{c.raisedAmount} {c.token}</strong></span>
                  <span className="text-emerald-400 font-bold">{progress}% Goal</span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
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
}
