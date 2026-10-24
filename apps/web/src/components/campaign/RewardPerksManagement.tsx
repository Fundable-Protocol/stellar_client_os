'use client';

import React, { useState } from 'react';
import { Gift, Plus, Edit2, Trash2, Calendar, Users, AlertCircle, CheckCircle } from 'lucide-react';
import { BackerRewardPerk, CreateRewardPerkInput } from '@/types/campaign-rewards-perks';

export interface RewardPerksManagementProps {
  campaignId: string;
  isCreator: boolean;
  rewards: BackerRewardPerk[];
  onAddReward?: (input: CreateRewardPerkInput) => Promise<void>;
  onEditReward?: (rewardId: string, input: Partial<CreateRewardPerkInput>) => Promise<void>;
  onDeleteReward?: (rewardId: string) => Promise<void>;
  onClaimReward?: (rewardId: string) => Promise<void>;
}

export function calculateSpots(quantityLimit: number, claimedCount: number) {
  const available = Math.max(0, quantityLimit - (claimedCount || 0));
  const isSoldOut = available === 0;
  return { available, isSoldOut };
}

export default function RewardPerksManagement({
  campaignId,
  isCreator,
  rewards,
  onAddReward,
  onEditReward,
  onDeleteReward,
  onClaimReward,
}: RewardPerksManagementProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formLimit, setFormLimit] = useState(25);
  const [formAmount, setFormAmount] = useState('50 XLM');

  const resetForm = () => {
    setFormTitle('');
    setFormDesc('');
    setFormDate('');
    setFormLimit(25);
    setFormAmount('50 XLM');
    setIsAdding(false);
    setEditingId(null);
  };

  const handleStartEdit = (perk: BackerRewardPerk) => {
    setEditingId(perk.id);
    setFormTitle(perk.title);
    setFormDesc(perk.description);
    setFormDate(perk.estimatedDeliveryDate);
    setFormLimit(perk.quantityLimit);
    setFormAmount(perk.pledgeAmount || '');
    setIsAdding(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId && onEditReward) {
      await onEditReward(editingId, {
        title: formTitle,
        description: formDesc,
        estimatedDeliveryDate: formDate,
        quantityLimit: Number(formLimit),
        pledgeAmount: formAmount,
      });
    } else if (onAddReward) {
      await onAddReward({
        title: formTitle,
        description: formDesc,
        estimatedDeliveryDate: formDate,
        quantityLimit: Number(formLimit),
        pledgeAmount: formAmount,
      });
    }
    resetForm();
  };

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Gift className="h-5 w-5 text-emerald-400" />
            Backer Rewards & Perks
          </h2>
          <p className="text-sm text-zinc-400">
            {isCreator
              ? 'Define reward tiers and perks for backers supporting your campaign.'
              : 'Select a reward tier to claim exclusive perks when you back this campaign.'}
          </p>
        </div>

        {isCreator && !isAdding && !editingId && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Reward Tier
          </button>
        )}
      </div>

      {(isAdding || editingId) && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900/90 p-4">
          <h3 className="font-semibold text-zinc-200">
            {editingId ? 'Edit Reward Tier' : 'Add New Reward Tier'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Title</label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Early Bird Vision Pass"
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Pledge Amount</label>
              <input
                type="text"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="e.g. 50 XLM"
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Estimated Delivery Date</label>
              <input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Quantity Limit (Spots)</label>
              <input
                type="number"
                min="1"
                required
                value={formLimit}
                onChange={(e) => setFormLimit(Number(e.target.value))}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Description</label>
            <textarea
              required
              rows={3}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Describe what the backer receives with this reward tier..."
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Save Reward Tier
            </button>
          </div>
        </form>
      )}

      {rewards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 py-12 text-center text-zinc-500">
          <Gift className="mx-auto mb-2 h-8 w-8 text-zinc-600" />
          <p>No reward perks configured for this campaign yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewards.map((perk) => {
            const { available, isSoldOut } = calculateSpots(perk.quantityLimit, perk.claimedCount);
            return (
              <div
                key={perk.id}
                className={`flex flex-col justify-between rounded-lg border p-4 transition-all ${
                  isSoldOut
                    ? 'border-zinc-800/80 bg-zinc-900/40 opacity-75'
                    : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-zinc-100">{perk.title}</h4>
                    {perk.pledgeAmount && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                        {perk.pledgeAmount}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">{perk.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800/80">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                      Est. {perk.estimatedDeliveryDate}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-zinc-500" />
                      Claimed: {perk.claimedCount} / {perk.quantityLimit}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium ${
                        isSoldOut ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {isSoldOut ? (
                        <>
                          <AlertCircle className="h-3.5 w-3.5" /> Sold Out
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-3.5 w-3.5" /> {available} spots available
                        </>
                      )}
                    </span>

                    {isCreator ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Edit ${perk.title}`}
                          onClick={() => handleStartEdit(perk)}
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {onDeleteReward && (
                          <button
                            type="button"
                            aria-label={`Delete ${perk.title}`}
                            onClick={() => onDeleteReward(perk.id)}
                            className="rounded p-1 text-zinc-400 hover:bg-rose-950 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ) : (
                      onClaimReward && (
                        <button
                          type="button"
                          disabled={isSoldOut}
                          onClick={() => onClaimReward(perk.id)}
                          className={`rounded px-2.5 py-1 text-xs font-semibold ${
                            isSoldOut
                              ? 'cursor-not-allowed bg-zinc-800 text-zinc-500'
                              : 'bg-emerald-600 text-white hover:bg-emerald-500'
                          }`}
                        >
                          {isSoldOut ? 'Sold Out' : 'Select Reward'}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
