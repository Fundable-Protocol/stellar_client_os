"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Trophy, CheckCircle2, Clock, PauseCircle, CircleDollarSign, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface GrantProgram {
  id: string;
  name: string;
  description?: string;
  matchPercentage: number;
  perCampaignCap: string;
  totalPool: string;
  allocated: string;
  eligibilityCriteria: string[];
  status: "OPEN" | "PAUSED" | "CLOSED";
  createdAt: number;
  updatedAt: number;
}

const STATUS_CONFIG: Record<GrantProgram["status"], { icon: React.ReactNode; badgeClass: string; label: string }> = {
  OPEN: { icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />, badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", label: "Open" },
  PAUSED: { icon: <PauseCircle className="h-4 w-4 text-amber-400" />, badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40", label: "Paused" },
  CLOSED: { icon: <Clock className="h-4 w-4 text-zinc-400" />, badgeClass: "bg-zinc-700/40 text-zinc-300 border-zinc-700", label: "Closed" },
};

const CRITERIA_LABELS: Record<string, string> = {
  REGION_SOUTH_GLOBAL: "Global South Creators",
  GENDER_MARGINALIZED: "Gender-marginalized Creators",
  DISABILITY: "Disabled Creators",
  INDIGENOUS: "Indigenous Creators",
  LGBTQ: "LGBTQ+ Creators",
  RACIAL_ETHNIC_MINORITY: "Racial/Ethnic Minorities",
};

function toPoolProgress(program: GrantProgram): number {
  const total = parseFloat(program.totalPool) || 0;
  const used = parseFloat(program.allocated) || 0;
  return total === 0 ? 0 : Math.round((used / total) * 100);
}

export function GrantProgramsDirectory() {
  const [programs, setPrograms] = useState<GrantProgram[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/grants", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : { data: [] })
      .then((payload) => setPrograms(payload.data ?? []))
      .catch(() => setPrograms([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-50 tracking-tight flex items-center gap-3">
            <Trophy className="h-8 w-8 text-amber-500" />
            Creator Grant Programs
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Platform-funded matching grants that boost campaigns by underrepresented creators. Match the first 10% of funds raised.
          </p>
        </div>
        <Link href="/campaigns">
          <Button variant="outline" className="border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800">
            Browse Campaigns
          </Button>
        </Link>
      </div>

      {/* Content */}
      {loading ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
          Loading grant programs…
        </div>
      ) : programs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
          No grant programs have been launched yet. Platform matching funds activate once a program is created.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {programs.map((program) => {
            const statusInfo = STATUS_CONFIG[program.status];
            const progress = toPoolProgress(program);
            const remaining = Math.max(0, parseFloat(program.totalPool) - parseFloat(program.allocated));
            return (
              <div
                key={program.id}
                className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl transition-all duration-300 hover:border-amber-500/40 hover:shadow-2xl"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={statusInfo.badgeClass}>
                      {statusInfo.icon}
                      <span className="ml-1.5">{statusInfo.label}</span>
                    </Badge>
                    <span className="text-xs font-bold text-amber-400">{program.matchPercentage}% Match</span>
                  </div>

                  <h3 className="text-xl font-bold text-zinc-100 group-hover:text-amber-300 transition-colors">
                    {program.name}
                  </h3>
                  {program.description && (
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{program.description}</p>
                  )}

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {program.eligibilityCriteria.map((criteria) => (
                      <Badge key={criteria} variant="outline" className="border-purple-800 bg-purple-950/40 text-[10px] text-purple-300">
                        {CRITERIA_LABELS[criteria] ?? criteria}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="mt-6 space-y-3 pt-4 border-t border-zinc-800">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-zinc-400">
                      Pool: <strong className="text-zinc-100 font-bold">{remaining.toLocaleString()} XLM</strong> remaining
                    </span>
                    <span className="text-zinc-500">{progress}% allocated</span>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400" style={{ width: `${progress}%` }} />
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-zinc-400 pt-1">
                    <span className="flex items-center gap-1">
                      <CircleDollarSign className="h-3.5 w-3.5 text-amber-400" />
                      Cap: {program.perCampaignCap === "0" ? "No cap" : `${program.perCampaignCap} XLM / campaign`}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-purple-400" />
                      {program.eligibilityCriteria.length} eligibility criteria
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-3">
        <h2 className="text-sm font-bold text-zinc-200">How Grant Matching Works</h2>
        <ul className="space-y-2 text-xs text-zinc-400">
          <li className="flex gap-2"><span className="text-amber-400 font-bold">1.</span> Platform profits fund a shared matching pool per grant program.</li>
          <li className="flex gap-2"><span className="text-amber-400 font-bold">2.</span> Campaigns from underrepresented creators apply the matching criteria tag during creation.</li>
          <li className="flex gap-2"><span className="text-amber-400 font-bold">3.</span> The platform automatically matches the first 10% (configurable) of funds raised, up to the per-campaign cap.</li>
          <li className="flex gap-2"><span className="text-amber-400 font-bold">4.</span> Matching funds vest transparently as backers contribute, visible in the creator analytics dashboard.</li>
        </ul>
      </div>
    </div>
  );
}

export default GrantProgramsDirectory;