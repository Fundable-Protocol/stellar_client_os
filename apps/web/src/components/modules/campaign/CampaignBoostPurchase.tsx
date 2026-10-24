"use client";

/**
 * Campaign Boost Purchase — Issue #1207
 *
 * Self-serve boost purchase flow. Creators pick a pricing tier, review
 * placements/duration, confirm payment, and see their active boosts.
 *
 * Acceptance Criteria:
 * - Self-serve boost purchase flow
 * - Shows pricing catalogue (Starter / Growth / Featured / Premium)
 * - Displays active boost status per campaign
 * - Submits purchase to /api/campaigns/:id/boost
 */

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  Loader2,
  Rocket,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BOOST_PRICING_CATALOGUE,
  BoostPricingTier,
  BoostStatus,
  CampaignBoost,
  PLACEMENT_LABELS,
} from "@/types/campaign-boost";

export interface CampaignBoostPurchaseProps {
  campaignId: string;
  creatorAddress: string;
}

const TIER_ICONS: Record<string, React.ReactNode> = {
  "Starter Boost": <Zap className="h-5 w-5 text-yellow-400" />,
  "Growth Boost": <Sparkles className="h-5 w-5 text-emerald-400" />,
  "Featured Boost": <Rocket className="h-5 w-5 text-blue-400" />,
  "Premium Boost": <BadgeCheck className="h-5 w-5 text-purple-400" />,
};

const STATUS_BADGE: Record<BoostStatus, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "border-yellow-500/40 text-yellow-500" },
  ACTIVE: { label: "Active", className: "border-emerald-500/40 text-emerald-500" },
  EXPIRED: { label: "Expired", className: "border-zinc-500/40 text-zinc-500" },
  CANCELLED: { label: "Cancelled", className: "border-red-500/40 text-red-500" },
};

export function CampaignBoostPurchase({ campaignId, creatorAddress }: CampaignBoostPurchaseProps) {
  const [activeBoosts, setActiveBoosts] = useState<CampaignBoost[]>([]);
  const [loadingBoosts, setLoadingBoosts] = useState(true);

  const [selected, setSelected] = useState<BoostPricingTier | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBoosts = useCallback(async () => {
    try {
      setLoadingBoosts(true);
      const res = await fetch(`/api/campaigns/${campaignId}/boost`);
      const data = await res.json();
      if (data.success && Array.isArray(data.boosts)) {
        setActiveBoosts(data.boosts);
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoadingBoosts(false);
    }
  }, [campaignId]);

  useEffect(() => { void loadBoosts(); }, [loadBoosts]);

  const handlePurchase = async () => {
    if (!selected) return;
    setError(null);
    setPurchasing(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/boost`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignId,
          creatorAddress,
          placements: selected.placements,
          durationDays: selected.durationDays,
          token: selected.token,
          idempotencyKey: `${campaignId}-boost-${selected.durationDays}-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Failed to purchase boost.");
        return;
      }
      setPurchased(true);
      setSelected(null);
      await loadBoosts();
      setTimeout(() => setPurchased(false), 5000);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Rocket className="h-5 w-5 text-fundable-purple-2" />
        <div>
          <h2 className="text-xl font-bold text-zinc-950 dark:text-white">Boost this Campaign</h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Get featured placement in search results, the homepage, and category pages.
          </p>
        </div>
      </div>

      {/* Active boosts */}
      {!loadingBoosts && activeBoosts.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-2">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Active & recent boosts
          </p>
          <ul className="space-y-1.5">
            {activeBoosts.map((boost) => (
              <li key={boost.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-zinc-700 dark:text-zinc-300">
                  {boost.placements.map((p) => PLACEMENT_LABELS[p]).join(" · ")}
                  {" · "}{boost.durationDays} days
                  {boost.startDate && (
                    <span className="ml-1 text-zinc-400">
                      (ends {new Date(boost.endDate).toLocaleDateString()})
                    </span>
                  )}
                </span>
                <Badge
                  variant="outline"
                  className={`${STATUS_BADGE[boost.status].className} text-[10px]`}
                >
                  {STATUS_BADGE[boost.status].label}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pricing catalogue */}
      <div>
        <p className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          Choose a boost package
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BOOST_PRICING_CATALOGUE.map((tier) => {
            const isSelected = selected?.label === tier.label;
            return (
              <button
                key={tier.label}
                type="button"
                aria-pressed={isSelected}
                onClick={() => { setSelected(tier); setError(null); }}
                className={`flex flex-col rounded-xl border p-4 text-left transition-all focus:outline-none ${
                  isSelected
                    ? "border-purple-600 bg-purple-50 dark:border-purple-500 dark:bg-purple-950/30 ring-1 ring-purple-500"
                    : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  {TIER_ICONS[tier.label]}
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {tier.label}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {tier.description}
                </p>
                <ul className="mt-2 space-y-0.5">
                  {tier.placements.map((p) => (
                    <li key={p} className="flex items-center gap-1 text-[11px] text-zinc-500">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                      {PLACEMENT_LABELS[p]}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-3">
                  <span className="text-xl font-bold text-zinc-900 dark:text-white">
                    {tier.totalPrice}
                  </span>
                  <span className="ml-1 text-xs text-zinc-500">{tier.token}</span>
                  <p className="text-[11px] text-zinc-400">{tier.durationDays} days</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Confirmation panel */}
      {selected && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-900/40 dark:bg-purple-950/20 space-y-3">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Confirm boost purchase
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-zinc-700 dark:text-zinc-300">
            <span className="text-zinc-500">Package</span>
            <span className="font-semibold">{selected.label}</span>
            <span className="text-zinc-500">Duration</span>
            <span>{selected.durationDays} days</span>
            <span className="text-zinc-500">Placements</span>
            <span>{selected.placements.map((p) => PLACEMENT_LABELS[p]).join(", ")}</span>
            <span className="text-zinc-500">Total cost</span>
            <span className="font-bold text-purple-700 dark:text-purple-300">
              {selected.totalPrice} {selected.token}
            </span>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-500">{error}</p>
          )}

          {purchased && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Boost purchased! Your campaign will be featured shortly.
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              data-testid="boost-confirm"
              onClick={handlePurchase}
              disabled={purchasing}
              className="flex items-center gap-2"
            >
              {purchasing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
              ) : (
                <><Rocket className="h-4 w-4" /> Purchase boost</>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setSelected(null); setError(null); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
