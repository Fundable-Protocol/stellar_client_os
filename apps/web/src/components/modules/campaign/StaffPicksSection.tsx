"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, Heart, Users, ChevronRight, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StaffPickBadge } from "./StaffPickBadge";
import { CharityBadge } from "./CharityBadge";

export interface StaffPickCampaign {
  id: string;
  title: string;
  category?: string;
  raisedAmount: string | number;
  goalAmount: string | number;
  token?: string;
  sponsorCount?: number;
  collaboratorCount?: number;
  status?: string;
  description?: string;
  isStaffPick?: boolean;
  staffPickReason?: string;
  charityBadge?: any;
}

interface StaffPicksSectionProps {
  initialCampaigns?: StaffPickCampaign[];
}

export function StaffPicksSection({ initialCampaigns }: StaffPicksSectionProps) {
  const [picks, setPicks] = useState<StaffPickCampaign[]>(initialCampaigns ?? []);
  const [loading, setLoading] = useState(!initialCampaigns);

  useEffect(() => {
    if (initialCampaigns && initialCampaigns.length > 0) return;

    let cancelled = false;
    async function loadPicks() {
      try {
        const res = await fetch("/api/campaigns/staff-picks");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && Array.isArray(json.data)) {
          const formatted = json.data.map((c: any) => ({
            id: c.id,
            title: c.name || c.title,
            category: c.category || "Environmental",
            raisedAmount: c.raisedAmount || "0",
            goalAmount: c.goalAmount || "1000",
            token: c.token || "XLM",
            sponsorCount: c.sponsorCount || 0,
            collaboratorCount: 0,
            status: c.status || "ACTIVE",
            description: c.description || "",
            isStaffPick: true,
            staffPickReason: c.staffPickReason,
            charityBadge: c.charityBadge,
          }));
          setPicks(formatted);
        }
      } catch (e) {
        console.error("Failed to fetch staff picks", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPicks();
    return () => {
      cancelled = true;
    };
  }, [initialCampaigns]);

  // If no picks loaded and not loading, show curated default staff pick
  const displayPicks = picks.length > 0 ? picks : (
    loading ? [] : [
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
        isStaffPick: true,
        staffPickReason: "Exceptional biodiversity impact and verified community guardianship model.",
      }
    ]
  );

  if (!loading && displayPicks.length === 0) {
    return null;
  }

  return (
    <section aria-label="Staff Picks" className="relative space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              Staff Picks
            </h2>
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] font-semibold">
              Curated by Editorial
            </Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Handpicked high-impact campaigns recognized by our editorial team for outstanding sustainability and execution.
          </p>
        </div>

        <Link
          href="/campaigns/editorial"
          className="text-xs text-amber-400 hover:text-amber-300 font-medium inline-flex items-center gap-1 self-start sm:self-auto"
        >
          Manage Picks <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {displayPicks.map((campaign) => {
          const raised = typeof campaign.raisedAmount === "string" ? parseFloat(campaign.raisedAmount.replace(/,/g, "")) : campaign.raisedAmount;
          const goal = typeof campaign.goalAmount === "string" ? parseFloat(campaign.goalAmount.replace(/,/g, "")) : campaign.goalAmount;
          const progress = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

          return (
            <div
              key={campaign.id}
              data-testid={`staff-pick-card-${campaign.id}`}
              className="group relative flex flex-col justify-between rounded-xl border border-amber-500/30 bg-gradient-to-b from-zinc-900/95 via-zinc-900/80 to-amber-950/10 p-6 shadow-xl transition-all duration-300 hover:border-amber-400/60 hover:shadow-amber-500/5 hover:shadow-2xl"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <StaffPickBadge reason={campaign.staffPickReason} size="sm" />
                    {campaign.category && (
                      <Badge className="bg-purple-950/60 text-purple-300 border-purple-800 text-[10px]">
                        {campaign.category}
                      </Badge>
                    )}
                  </div>
                  {campaign.status && (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px] whitespace-nowrap">
                      <ShieldCheck className="mr-1 h-3 w-3 inline" /> {campaign.status}
                    </Badge>
                  )}
                </div>

                <h3 className="text-xl font-bold text-zinc-100 group-hover:text-amber-200 transition-colors">
                  {campaign.title}
                </h3>

                {campaign.staffPickReason && (
                  <p className="text-xs font-medium text-amber-300/90 italic bg-amber-500/10 border-l-2 border-amber-400 pl-2.5 py-1 rounded-r">
                    “{campaign.staffPickReason}”
                  </p>
                )}

                <CharityBadge badge={campaign.charityBadge} />
                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                  {campaign.description}
                </p>
              </div>

              <div className="mt-6 space-y-4 pt-4 border-t border-zinc-800/80">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-zinc-400">
                    Raised: <strong className="text-zinc-100 font-bold">{campaign.raisedAmount} {campaign.token ?? "XLM"}</strong>
                  </span>
                  <span className="text-amber-400 font-bold">{progress}% Goal</span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${progress}% funded`}>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <div className="flex items-center gap-3 text-zinc-400 text-[11px]">
                    <span className="flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5 text-rose-400 fill-rose-400/20" />
                      {campaign.sponsorCount ?? 0} Sponsors
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-purple-400" />
                      {campaign.collaboratorCount ?? 0} Co-Creators
                    </span>
                  </div>

                  <Link href={`/campaigns/${campaign.id}`}>
                    <Button size="sm" variant="ghost" className="text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-950/40">
                      View Campaign <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
