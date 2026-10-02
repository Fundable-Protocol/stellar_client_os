"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Check, MapPin, Plus, Scale, Trees, Users, X } from "lucide-react";
import { INITIAL_CAMPAIGNS } from "./CampaignSearch";
import type { CampaignData } from "@/types/campaign";

const MAX_COMPARISONS = 3;
const CO2_PER_TREE_KG = 22;

function completionRate(campaign: CampaignData): number {
  return campaign.targetTrees > 0
    ? Math.min(100, Math.round((campaign.treesPlanted / campaign.targetTrees) * 100))
    : 0;
}

function co2Impact(campaign: CampaignData): string {
  return `${(campaign.treesPlanted * CO2_PER_TREE_KG).toLocaleString()} kg`;
}

const COMPARISON_ROWS = [
  { label: "Tree species", icon: Trees, value: (campaign: CampaignData) => campaign.treeType },
  { label: "Location", icon: MapPin, value: (campaign: CampaignData) => campaign.location ?? "Not specified" },
  { label: "Completion rate", icon: Check, value: (campaign: CampaignData) => `${completionRate(campaign)}%` },
  { label: "Estimated CO2 impact", icon: Trees, value: co2Impact },
  { label: "Sponsors", icon: Users, value: (campaign: CampaignData) => (campaign.sponsorCount ?? 0).toLocaleString() },
  { label: "Cost per tree", icon: Scale, value: (campaign: CampaignData) => `${campaign.costPerTree} ${campaign.token}` },
];

export default function CampaignComparison() {
  const [selectedIds, setSelectedIds] = React.useState<string[]>(INITIAL_CAMPAIGNS.slice(0, 3).map((campaign) => campaign.id));
  const selectedCampaigns = selectedIds
    .map((id) => INITIAL_CAMPAIGNS.find((campaign) => campaign.id === id))
    .filter((campaign): campaign is CampaignData => Boolean(campaign));

  function toggleCampaign(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((selectedId) => selectedId !== id);
      if (current.length >= MAX_COMPARISONS) return current;
      return [...current, id];
    });
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/campaigns" className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-emerald-400">
            <ArrowLeft className="size-4" /> Back to campaigns
          </Link>
          <div className="flex items-center gap-3">
            <Scale className="size-8 text-emerald-400" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Sponsor workspace</p>
              <h1 className="text-3xl font-black tracking-tight text-white">Compare campaigns</h1>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Put up to three reforestation initiatives side by side before choosing where your sponsorship will make the biggest difference.
          </p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-right">
          <p className="text-2xl font-black text-emerald-300">{selectedCampaigns.length}/{MAX_COMPARISONS}</p>
          <p className="text-xs text-emerald-200/70">campaigns selected</p>
        </div>
      </div>

      <section aria-label="Choose campaigns to compare" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-200">Choose campaigns</h2>
          <p className="text-xs text-zinc-500">Select up to three</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {INITIAL_CAMPAIGNS.map((campaign) => {
            const selected = selectedIds.includes(campaign.id);
            const unavailable = !selected && selectedIds.length >= MAX_COMPARISONS;
            return (
              <button
                key={campaign.id}
                type="button"
                aria-pressed={selected}
                disabled={unavailable}
                onClick={() => toggleCampaign(campaign.id)}
                className={`flex min-h-24 items-start justify-between gap-4 rounded-xl border p-4 text-left transition-colors ${selected ? "border-emerald-400/60 bg-emerald-500/10" : "border-zinc-800 bg-slate-900/70 hover:border-zinc-600"} ${unavailable ? "cursor-not-allowed opacity-45" : ""}`}
              >
                <span>
                  <span className="block text-sm font-bold text-zinc-100">{campaign.title}</span>
                  <span className="mt-1 block text-xs text-zinc-500">{campaign.treeType} · {campaign.location}</span>
                </span>
                <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border ${selected ? "border-emerald-300 bg-emerald-400 text-zinc-950" : "border-zinc-600 text-zinc-500"}`}>
                  {selected ? <Check className="size-4" /> : <Plus className="size-4" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {selectedCampaigns.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-700 bg-slate-900/50 px-6 py-16 text-center">
          <Scale className="mx-auto size-10 text-zinc-600" />
          <h2 className="mt-4 text-lg font-bold text-zinc-200">Select a campaign to start comparing</h2>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-slate-900/80 shadow-xl">
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="grid grid-cols-[minmax(170px,0.8fr)_repeat(3,minmax(170px,1fr))] border-b border-zinc-800">
                <div className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Campaign details</p></div>
                {selectedCampaigns.map((campaign) => (
                  <div key={campaign.id} className="border-l border-zinc-800 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-emerald-400">{campaign.treeType}</p>
                        <h2 className="mt-1 text-sm font-bold leading-snug text-white">{campaign.title}</h2>
                      </div>
                      <button type="button" onClick={() => toggleCampaign(campaign.id)} aria-label={`Remove ${campaign.title}`} className="text-zinc-500 transition-colors hover:text-rose-400">
                        <X className="size-4" />
                      </button>
                    </div>
                    <Link href={`/campaigns/${campaign.id}`} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300">
                      View campaign <ArrowLeft className="size-3 rotate-180" />
                    </Link>
                  </div>
                ))}
              </div>
              {COMPARISON_ROWS.map(({ label, icon: Icon, value }) => (
                <div key={label} className="grid grid-cols-[minmax(170px,0.8fr)_repeat(3,minmax(170px,1fr))] border-b border-zinc-800 last:border-b-0">
                  <div className="flex items-center gap-2 p-5 text-xs font-semibold text-zinc-400"><Icon className="size-4 text-emerald-400" />{label}</div>
                  {selectedCampaigns.map((campaign) => <div key={campaign.id} className="border-l border-zinc-800 p-5 text-sm font-semibold text-zinc-100">{value(campaign)}</div>)}
                </div>
              ))}
            </div>
          </div>
          <p className="border-t border-zinc-800 px-5 py-3 text-[11px] text-zinc-500">CO2 impact is an estimate based on {CO2_PER_TREE_KG} kg captured per planted tree.</p>
        </section>
      )}
    </main>
  );
}