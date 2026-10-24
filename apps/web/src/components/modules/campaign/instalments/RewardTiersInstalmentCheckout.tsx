"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CheckCircle2, Calendar, CreditCard, ChevronRight, AlertCircle, ShieldCheck, Sparkles, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/providers/StellarWalletProvider";
import { PersonalizedCampaignRecommendations } from "@/components/campaign/PersonalizedCampaignRecommendations";
import {
  RewardTier,
  InstalmentPlanMonths,
  InstalmentPlanBreakdown,
  BackerInstalmentPledge,
} from "@/types/campaign-instalments";
import { ANONYMITY_TOOLTIP } from "@/types/backer-anonymity";

export interface RewardTiersInstalmentCheckoutProps {
  campaignId: string;
  creatorAddress?: string;
  campaignCloseDate?: number;
  initialTiers?: RewardTier[];
}

export function RewardTiersInstalmentCheckout({
  campaignId,
  creatorAddress: _creatorAddress,
  campaignCloseDate,
  initialTiers = [],
}: RewardTiersInstalmentCheckoutProps) {
  const { address, isConnected, openModal } = useWallet();

  const [tiers, setTiers] = useState<RewardTier[]>(initialTiers);
  const [loadingTiers, setLoadingTiers] = useState(initialTiers.length === 0);
  const [selectedTier, setSelectedTier] = useState<RewardTier | null>(null);

  // Checkout modal / plan state
  const [selectedPlanMonths, setSelectedPlanMonths] = useState<InstalmentPlanMonths>(3);
  const [planBreakdown, setPlanBreakdown] = useState<InstalmentPlanBreakdown | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);

  const [backerEmail, setBackerEmail] = useState("");
  // #1195 — backer anonymity at pledge time
  const [pledgeAnonymous, setPledgeAnonymous] = useState(false);
  const [hideAmount, setHideAmount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedPledge, setCompletedPledge] = useState<BackerInstalmentPledge | null>(null);

  // Fetch campaign tiers if not provided
  useEffect(() => {
    if (initialTiers.length > 0) return;
    async function loadTiers() {
      try {
        setLoadingTiers(true);
        const res = await fetch(`/api/campaigns/${campaignId}/reward-tiers`);
        const data = await res.json();
        if (data.success && Array.isArray(data.rewardTiers) && data.rewardTiers.length > 0) {
          setTiers(data.rewardTiers);
        } else {
          // Provide high-value default reward tiers demonstrating instalment options
          setTiers([
            {
              id: "tier-silver-patron",
              campaignId,
              name: "Silver Canopy Patron",
              description: "Sponsor 100 native trees with permanent plaque & carbon credits.",
              amount: "300.00",
              token: "USDC",
              instalmentEnabled: true,
              allowedPlanMonths: [2, 3, 6],
              perks: ["Digital Impact Certificate", "Tree ID Registry", "Monthly Field Reports"],
              claimed: 4,
              limit: 25,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: "tier-gold-guardian",
              campaignId,
              name: "Gold Forest Guardian",
              description: "Sponsor a dedicated reforestation grove (250 trees) with GPS monitoring.",
              amount: "600.00",
              token: "USDC",
              instalmentEnabled: true,
              allowedPlanMonths: [2, 3, 6],
              perks: ["Custom Drone Footage", "Exclusive Community Vote", "Gold Impact NFT"],
              nftReward: {
                enabled: true,
                assetUrl: "https://ipfs.io/ipfs/QmGoldForestGuardianNFT/gold.png",
                fileName: "gold-guardian.png",
                symbol: "GUARDIAN",
              },
              claimed: 2,
              limit: 15,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: "tier-platinum-benefactor",
              campaignId,
              name: "Platinum Biosphere Benefactor",
              description: "Lead corporate/private sponsorship for 500 trees and on-site community sanctuary.",
              amount: "1200.00",
              token: "USDC",
              instalmentEnabled: true,
              allowedPlanMonths: [2, 3, 6],
              perks: ["Named Sanctuary Plaque", "Quarterly Creator Briefing", "Platinum Badge"],
              nftReward: {
                enabled: true,
                assetUrl: "https://ipfs.io/ipfs/QmPlatinumBiosphereNFT/platinum.png",
                fileName: "platinum-benefactor.png",
                symbol: "PLATINUM",
              },
              claimed: 1,
              limit: 5,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ]);
        }
      } catch {
        // Fallback gracefully
      } finally {
        setLoadingTiers(false);
      }
    }
    loadTiers();
  }, [campaignId, initialTiers]);

  // Fetch plan breakdown when selected tier or chosen months change
  const fetchBreakdown = useCallback(async (tier: RewardTier, months: InstalmentPlanMonths) => {
    try {
      setLoadingBreakdown(true);
      setError(null);
      const res = await fetch(`/api/campaigns/${campaignId}/reward-tiers/${tier.id}/instalments?months=${months}`);
      const data = await res.json();
      if (data.success && data.breakdown) {
        setPlanBreakdown(data.breakdown);
      } else {
        // Fallback calculation locally
        const total = parseFloat(tier.amount);
        const monthly = (total / months).toFixed(2);
        const close = campaignCloseDate || Date.now() + 30 * 24 * 60 * 60 * 1000;
        setPlanBreakdown({
          totalAmount: tier.amount,
          months,
          monthlyAmount: monthly,
          firstPaymentDate: close,
          schedule: Array.from({ length: months }, (_, i) => ({
            instalmentNumber: i + 1,
            amount: monthly,
            dueDate: close + i * 30 * 24 * 60 * 60 * 1000,
          })),
        });
      }
    } catch {
      // Local fallback
      const total = parseFloat(tier.amount);
      const monthly = (total / months).toFixed(2);
      const close = campaignCloseDate || Date.now() + 30 * 24 * 60 * 60 * 1000;
      setPlanBreakdown({
        totalAmount: tier.amount,
        months,
        monthlyAmount: monthly,
        firstPaymentDate: close,
        schedule: Array.from({ length: months }, (_, i) => ({
          instalmentNumber: i + 1,
          amount: monthly,
          dueDate: close + i * 30 * 24 * 60 * 60 * 1000,
        })),
      });
    } finally {
      setLoadingBreakdown(false);
    }
  }, [campaignId, campaignCloseDate]);

  const handleSelectTier = (tier: RewardTier) => {
    setSelectedTier(tier);
    setCompletedPledge(null);
    setError(null);
    const defaultMonths = (tier.allowedPlanMonths && tier.allowedPlanMonths[0]) || 3;
    setSelectedPlanMonths(defaultMonths);
    fetchBreakdown(tier, defaultMonths);
  };

  const handlePlanChange = (months: InstalmentPlanMonths) => {
    setSelectedPlanMonths(months);
    if (selectedTier) {
      fetchBreakdown(selectedTier, months);
    }
  };

  const handleConfirmCheckout = async () => {
    if (!isConnected || !address) {
      openModal();
      return;
    }

    if (!selectedTier) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/reward-tiers/${selectedTier.id}/instalments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backerAddress: address,
          backerEmail: backerEmail.trim() || undefined,
          planMonths: selectedPlanMonths,
          anonymous: pledgeAnonymous,
          hideAmount: pledgeAnonymous && hideAmount,
          idempotencyKey: `${campaignId}-${selectedTier.id}-${address}-${selectedPlanMonths}`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to confirm instalment pledge.");
      }

      setCompletedPledge(data.pledge);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error confirming checkout.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-950 dark:text-white flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-fundable-purple-2" />
            Reward Tiers & Instalment Plans
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Support high-value reward tiers with flexible 2, 3, or 6 monthly instalments. First payment is charged at campaign close.
          </p>
        </div>
      </div>

      {loadingTiers ? (
        <div className="py-8 text-center text-sm text-zinc-500">Loading reward tiers...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`rounded-xl border p-5 transition-all flex flex-col justify-between ${
                selectedTier?.id === tier.id
                  ? "border-purple-600 bg-purple-50/20 dark:border-purple-500 dark:bg-purple-950/20 shadow-md ring-1 ring-purple-500"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-zinc-950 dark:text-white">{tier.name}</h3>
                  <div className="flex flex-col items-end gap-1">
                    {tier.nftReward?.enabled && (
                      <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-[11px] whitespace-nowrap flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        Stellar NFT Included
                      </Badge>
                    )}
                    {tier.instalmentEnabled && (
                      <Badge className="bg-emerald-600 text-white text-[11px] whitespace-nowrap">
                        Instalments Available
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-zinc-950 dark:text-white">
                    {tier.amount}
                  </span>
                  <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    {tier.token}
                  </span>
                </div>

                {tier.instalmentEnabled && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Or from {(parseFloat(tier.amount) / 6).toFixed(2)} {tier.token}/mo (up to 6 months)
                  </p>
                )}

                {tier.description && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {tier.description}
                  </p>
                )}

                {tier.perks && tier.perks.length > 0 && (
                  <ul className="space-y-1 pt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {tier.perks.map((perk, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-4 mt-3 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                  onClick={() => handleSelectTier(tier)}
                  className={`w-full text-xs font-semibold ${
                    selectedTier?.id === tier.id
                      ? "bg-purple-600 text-white hover:bg-purple-700"
                      : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                  }`}
                >
                  {selectedTier?.id === tier.id ? "Selected" : "Select Reward Tier"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Checkout Modal / Drawer for selected tier */}
      {selectedTier && (
        <div className="mt-8 rounded-xl border border-purple-200 bg-white p-6 shadow-lg dark:border-purple-900/60 dark:bg-zinc-950">
          {completedPledge ? (
            <div className="text-center py-6 space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-zinc-950 dark:text-white">Instalment Pledge Confirmed!</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-md mx-auto">
                You have pledged for <strong>{completedPledge.tierName}</strong> on a {completedPledge.planMonths}-month instalment plan ({completedPledge.monthlyAmount} {completedPledge.token}/month).
              </p>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 max-w-lg mx-auto text-left dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Schedule Overview</p>
                <div className="space-y-2 text-xs">
                  {completedPledge.schedule.map((inst) => (
                    <div key={inst.instalmentNumber} className="flex justify-between items-center text-zinc-700 dark:text-zinc-300">
                      <span>Instalment #{inst.instalmentNumber} {inst.instalmentNumber === 1 ? "(Campaign Close)" : ""}</span>
                      <span className="font-semibold">{inst.amount} {completedPledge.token}</span>
                      <span className="text-zinc-500">{new Date(inst.dueDate).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedTier(null)}>
                  Done
                </Button>
              </div>
              <PersonalizedCampaignRecommendations />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
                <div>
                  <h3 className="text-lg font-bold text-zinc-950 dark:text-white">
                    Checkout: {selectedTier.name}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Total Tier Price: <strong className="text-zinc-900 dark:text-zinc-100">{selectedTier.amount} {selectedTier.token}</strong>
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedTier(null)}>
                  ✕ Close
                </Button>
              </div>

              {/* Plan Duration Selector (2, 3, or 6 months) */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 block">
                  Select Instalment Plan Duration:
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {([2, 3, 6] as InstalmentPlanMonths[]).map((months) => (
                    <button
                      key={months}
                      type="button"
                      onClick={() => handlePlanChange(months)}
                      className={`flex flex-col items-center justify-center rounded-lg border p-4 text-center transition-all ${
                        selectedPlanMonths === months
                          ? "border-purple-600 bg-purple-50 dark:border-purple-500 dark:bg-purple-950/40 text-purple-900 dark:text-purple-100 font-bold ring-2 ring-purple-500"
                          : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
                      }`}
                    >
                      <span className="text-base font-bold">{months} Months</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        ~{(parseFloat(selectedTier.amount) / months).toFixed(2)} {selectedTier.token}/mo
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Schedule Preview */}
              {loadingBreakdown ? (
                <div className="py-4 text-center text-xs text-zinc-500">Calculating schedule...</div>
              ) : planBreakdown ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-purple-600" />
                      Payment Schedule ({planBreakdown.months} instalments)
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {planBreakdown.monthlyAmount} {selectedTier.token} / month
                    </span>
                  </div>

                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                    {planBreakdown.schedule.map((item) => (
                      <div key={item.instalmentNumber} className="py-2 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">
                            Instalment #{item.instalmentNumber}
                          </span>
                          {item.instalmentNumber === 1 && (
                            <span className="ml-2 inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              First: at campaign close
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">
                            {item.amount} {selectedTier.token}
                          </span>
                          <span className="ml-3 text-zinc-500">
                            Due: {new Date(item.dueDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 italic pt-1">
                    Acceptance Criteria: First instalment charged at campaign close; subsequent on monthly schedule.
                  </div>
                </div>
              ) : null}

              {/* Optional email for schedule notifications */}
              <div>
                <label htmlFor="backerEmail" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Notification Email (optional)
                </label>
                <input
                  id="backerEmail"
                  type="email"
                  placeholder="backer@example.com"
                  value={backerEmail}
                  onChange={(e) => setBackerEmail(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              {/* #1195 — Backer anonymity at pledge time */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60 space-y-3">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5">
                  <EyeOff className="h-3.5 w-3.5" />
                  Privacy options
                </p>
                <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="pledge-anonymous"
                    checked={pledgeAnonymous}
                    onChange={(e) => {
                      setPledgeAnonymous(e.target.checked);
                      if (!e.target.checked) setHideAmount(false);
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-purple-600"
                  />
                  <span>
                    <span className="font-medium">Pledge anonymously</span>
                    <span className="ml-1 text-xs text-zinc-500" title={ANONYMITY_TOOLTIP}>
                      — hide my name &amp; address from the public backer list
                    </span>
                  </span>
                </label>
                {pledgeAnonymous && (
                  <label className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer pl-6">
                    <input
                      type="checkbox"
                      data-testid="pledge-hide-amount"
                      checked={hideAmount}
                      onChange={(e) => setHideAmount(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-purple-600"
                    />
                    <span>Also hide my pledge amount from the public list</span>
                  </label>
                )}
                <p className="text-[11px] text-zinc-500 dark:text-zinc-500 leading-relaxed">
                  You will still receive your reward tier, receipt, and all campaign updates
                  regardless of this setting.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Checkout Button */}
              <div className="pt-2">
                <Button
                  onClick={handleConfirmCheckout}
                  disabled={isSubmitting}
                  className="w-full bg-fundable-purple-2 text-white hover:bg-fundable-purple-1 font-semibold flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    "Processing Checkout..."
                  ) : isConnected ? (
                    <>
                      Confirm {selectedPlanMonths}-Month Plan ({planBreakdown?.monthlyAmount || selectedTier.amount} {selectedTier.token}/mo)
                      <ChevronRight className="h-4 w-4" />
                    </>
                  ) : (
                    "Connect Wallet to Checkout"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
