"use client";

import React, { useState } from "react";
import { Package, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RewardTier } from "@/types/campaign-instalments";

interface CreatorRewardTierModalProps {
  campaignId: string;
  creatorAddress: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (tier: RewardTier) => void;
}

export function CreatorRewardTierModal({
  campaignId,
  creatorAddress,
  isOpen,
  onClose,
  onCreated,
}: CreatorRewardTierModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("150.00");
  const [token, setToken] = useState("USDC");
  const [isPhysical, setIsPhysical] = useState(false);
  const [stockCount, setStockCount] = useState<string>("50");
  const [perksText, setPerksText] = useState("");
  const [instalmentEnabled, setInstalmentEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please provide a name for this reward tier.");
      return;
    }

    const price = parseFloat(amount);
    if (isNaN(price) || price <= 0) {
      setError("Reward tier amount must be a positive number.");
      return;
    }

    let parsedStock: number | undefined = undefined;
    if (isPhysical) {
      if (!stockCount.trim()) {
        setError("Please enter a stock count for physical rewards.");
        return;
      }
      const count = parseInt(stockCount.trim(), 10);
      if (isNaN(count) || count < 0) {
        setError("Stock count must be a non-negative integer.");
        return;
      }
      parsedStock = count;
    }

    setIsSubmitting(true);
    try {
      const perks = perksText
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);

      const res = await fetch(`/api/campaigns/${campaignId}/reward-tiers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorAddress,
          tier: {
            name: name.trim(),
            description: description.trim() || undefined,
            amount: price.toFixed(2),
            token: token || "USDC",
            instalmentEnabled,
            allowedPlanMonths: instalmentEnabled ? [2, 3, 6] : [],
            perks,
            isPhysical,
            stockCount: parsedStock,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create reward tier");
      }

      onCreated(data.rewardTier);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating reward tier");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-950 dark:text-white">Add Campaign Reward Tier</h2>
              <p className="text-xs text-zinc-500">Configure reward tier pricing, physical inventory, and perks</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="tier-name" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Tier Name *
            </Label>
            <Input
              id="tier-name"
              placeholder="e.g. Eco-Fleece Hoodie & Tree Adoption"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tier-amount" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Amount ({token}) *
              </Label>
              <Input
                id="tier-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="150.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 text-xs"
                required
              />
            </div>
            <div>
              <Label htmlFor="tier-token" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Currency
              </Label>
              <Input
                id="tier-token"
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                className="mt-1 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="tier-description" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Description
            </Label>
            <textarea
              id="tier-description"
              rows={2}
              placeholder="Detailed description of this reward and deliverables..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-2.5 text-xs text-zinc-900 focus:border-purple-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          {/* Physical Reward Inventory Management (Acceptance Criteria 1) */}
          <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-4 dark:border-purple-900/40 dark:bg-purple-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="is-physical" className="text-xs font-bold text-zinc-900 dark:text-zinc-100 cursor-pointer">
                  Physical Reward Inventory
                </Label>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Track stock count with automatic lock-out when stock is exhausted
                </p>
              </div>
              <input
                id="is-physical"
                type="checkbox"
                checked={isPhysical}
                onChange={(e) => setIsPhysical(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
              />
            </div>

            {isPhysical && (
              <div className="pt-2 border-t border-purple-200/60 dark:border-purple-800/60">
                <Label htmlFor="tier-stock" className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Stock Count (Initial Inventory) *
                </Label>
                <Input
                  id="tier-stock"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 50"
                  value={stockCount}
                  onChange={(e) => setStockCount(e.target.value)}
                  className="mt-1 text-xs"
                  required={isPhysical}
                />
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  When stock drops to 0, this tier will be greyed out and unselectable.
                </p>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="tier-perks" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Perks / Deliverables (one per line)
            </Label>
            <textarea
              id="tier-perks"
              rows={2}
              placeholder="e.g. 100% Organic Cotton&#10;Numbered Certificate&#10;Free Worldwide Shipping"
              value={perksText}
              onChange={(e) => setPerksText(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-2.5 text-xs text-zinc-900 focus:border-purple-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="flex items-center justify-between py-1">
            <div>
              <Label htmlFor="tier-instalments" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer">
                Enable Instalments (2, 3, 6 Months)
              </Label>
              <p className="text-[11px] text-zinc-500">Allow backers to pay monthly instalments</p>
            </div>
            <input
              id="tier-instalments"
              type="checkbox"
              checked={instalmentEnabled}
              onChange={(e) => setInstalmentEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-purple-600 text-white hover:bg-purple-700"
            >
              {isSubmitting ? "Creating..." : "Save Reward Tier"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
