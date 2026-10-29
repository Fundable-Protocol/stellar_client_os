"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Star, TrendingUp, ChevronRight, Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Homepage Spotlight section (issue #1198).
 *
 * Surfaces two complementary groups of campaigns on the homepage:
 *   1. **Editor's Spotlight** — campaigns manually curated by admins via the
 *      existing Staff Picks admin panel (editorial selection).
 *   2. **Trending Now** — campaigns ranked by the trending algorithm, whose
 *      score factors in funding velocity AND social shares (#1198).
 *
 * Both lists are fetched client-side from the existing APIs; the section is a
 * client component following the same pattern as `StaffPicksSection`.
 */

interface SpotlightCampaign {
  id: string;
  title: string;
  category?: string;
  raisedAmount: string | number;
  goalAmount: string | number;
  token?: string;
  sponsorCount?: number;
  status?: string;
  description?: string;
  score?: number;
  socialShares?: number;
}

function parseAmount(value: string | number | undefined): number {
  if (value === undefined) return 0;
  return typeof value === "string"
    ? parseFloat(value.replace(/,/g, "")) || 0
    : value;
}

function CampaignCard({
  campaign,
  variant,
}: {
  campaign: SpotlightCampaign;
  variant: "editor" | "trending";
}) {
  const raised = parseAmount(campaign.raisedAmount);
  const goal = parseAmount(campaign.goalAmount);
  const progress = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return (
    <div
      data-testid={`spotlight-${variant}-card-${campaign.id}`}
      className={`group relative flex flex-col justify-between rounded-xl border p-5 transition-all duration-300 hover:shadow-2xl ${
        variant === "editor"
          ? "border-amber-500/30 bg-gradient-to-b from-zinc-900/95 to-amber-950/10 hover:border-amber-400/60"
          : "border-emerald-500/25 bg-gradient-to-b from-zinc-900/95 to-emerald-950/10 hover:border-emerald-400/60"
      }`}
    >
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {variant === "editor" ? (
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] font-semibold">
                <Star className="mr-1 h-3 w-3 inline" /> Editor's Pick
              </Badge>
            ) : (
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] font-semibold">
                <Flame className="mr-1 h-3 w-3 inline" /> Trending
              </Badge>
            )}
            {campaign.category && (
              <Badge className="bg-purple-950/60 text-purple-300 border-purple-800 text-[10px]">
                {campaign.category}
              </Badge>
            )}
          </div>
          {variant === "trending" && typeof campaign.score === "number" && (
            <span className="text-[10px] text-emerald-400 font-bold">
              {campaign.score.toFixed(1)} score
            </span>
          )}
        </div>

        <h3 className="text-lg font-bold text-zinc-100 group-hover:text-amber-200 transition-colors">
          {campaign.title}
        </h3>
        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
          {campaign.description}
        </p>
      </div>

      <div className="mt-4 space-y-3 pt-3 border-t border-zinc-800/80">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-zinc-400">
            Raised: <strong className="text-zinc-100">{campaign.raisedAmount} {campaign.token ?? "XLM"}</strong>
          </span>
          <span className={variant === "editor" ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>
            {progress}% Goal
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${progress}% funded`}
        >
          <div
            className={`h-full rounded-full ${
              variant === "editor"
                ? "bg-gradient-to-r from-amber-500 to-emerald-400"
                : "bg-gradient-to-r from-emerald-500 to-teal-400"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="flex items-center gap-1 text-zinc-400 text-[11px]">
            <Heart className="h-3.5 w-3.5 text-rose-400 fill-rose-400/20" />
            {campaign.sponsorCount ?? 0} Sponsors
            {variant === "trending" && typeof campaign.socialShares === "number" && (
              <span className="ml-2 text-emerald-400/80">{campaign.socialShares} shares</span>
            )}
          </span>
          <Link href={`/campaigns/${campaign.id}`}>
            <Button size="sm" variant="ghost" className="text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-950/40">
              View <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function SpotlightSection() {
  const [editors, setEditors] = useState<SpotlightCampaign[]>([]);
  const [trending, setTrending] = useState<SpotlightCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [picksRes, trendingRes] = await Promise.allSettled([
          fetch("/api/campaigns/staff-picks").then((r) => r.json()),
          fetch("/api/campaigns/trending?limit=4").then((r) => r.json()),
        ]);

        if (!cancelled && picksRes.status === "fulfilled" && Array.isArray(picksRes.value?.data)) {
          setEditors(
            picksRes.value.data.map((c: any) => ({
              id: c.id,
              title: c.name || c.title,
              category: c.category,
              raisedAmount: c.raisedAmount || "0",
              goalAmount: c.goalAmount || "1000",
              token: c.token || "XLM",
              sponsorCount: c.sponsorCount || 0,
              status: c.status,
              description: c.description || "",
            }))
          );
        }

        if (!cancelled && trendingRes.status === "fulfilled" && Array.isArray(trendingRes.value?.data)) {
          setTrending(
            trendingRes.value.data.map((c: any) => ({
              id: c.id,
              title: c.title || c.name || `Campaign #${c.id}`,
              raisedAmount: c.totalRaised || c.raisedAmount || "0",
              goalAmount: c.targetAmount || c.goalAmount || "1000",
              token: "XLM",
              sponsorCount: c.uniqueContributors || 0,
              status: c.status,
              description: c.description || "",
              score: c.score,
              socialShares: c.socialShares ?? c.raw?.socialShares ?? 0,
            }))
          );
        }
      } catch (e) {
        console.error("Failed to load spotlight campaigns", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && editors.length === 0 && trending.length === 0) return null;

  return (
    <section aria-label="Featured & Spotlight" className="space-y-6">
      <div className="border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Star className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">Featured &amp; Spotlight</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Editorially curated campaigns plus the ones trending right now by funding velocity and social shares.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/60" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {editors.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-400" /> Editor&apos;s Spotlight
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {editors.slice(0, 2).map((c) => (
                  <CampaignCard key={c.id} campaign={c} variant="editor" />
                ))}
              </div>
            </div>
          )}

          {trending.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" /> Trending Now
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {trending.slice(0, 4).map((c) => (
                  <CampaignCard key={c.id} campaign={c} variant="trending" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default SpotlightSection;
