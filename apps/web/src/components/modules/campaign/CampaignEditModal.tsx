"use client";

import React, { useState } from "react";
import { updateCampaignSchema, UpdateCampaignFormData } from "@/lib/validations";
import { Campaign, CampaignStatus } from "@/types";

interface CampaignEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign;
  onSuccess?: (updatedCampaign: Partial<Campaign>) => void;
}

/**
 * CampaignEditModal Component (Issue #721)
 *
 * Allows creators to edit campaign details (name, description, goal amount, deadline)
 * before the campaign goes live.
 */
export const CampaignEditModal: React.FC<CampaignEditModalProps> = ({
  isOpen,
  onClose,
  campaign,
  onSuccess,
}) => {
  const [name, setName] = useState(campaign.name || "");
  const [description, setDescription] = useState(campaign.description || "");
  const [goalAmount, setGoalAmount] = useState(campaign.goal_amount ? campaign.goal_amount.toString() : "");
  const [deadline, setDeadline] = useState(
    campaign.end_time ? new Date(campaign.end_time * 1000).toISOString().slice(0, 16) : ""
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isEditable = campaign.status === CampaignStatus.Draft || campaign.status === CampaignStatus.Active;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    const formData: UpdateCampaignFormData = {
      id: campaign.id,
      name,
      description,
      goalAmount,
      deadline,
    };

    const validation = updateCampaignSchema.safeParse(formData);
    if (!validation.success) {
      const formattedErrors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          formattedErrors[issue.path[0].toString()] = issue.message;
        }
      });
      setErrors(formattedErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          goalAmount,
          deadline: Math.floor(new Date(deadline).getTime() / 1000),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update campaign");
      }

      const updated = await response.json();
      if (onSuccess) {
        onSuccess(updated);
      }
      onClose();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "An unexpected error occurred";
      setServerError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 text-white shadow-2xl">
        <div className="flex justify-between items-center pb-4 border-b border-slate-800">
          <h2 className="text-xl font-bold text-emerald-400">Edit Campaign Details</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            type="button"
          >
            ✕
          </button>
        </div>

        {!isEditable ? (
          <div className="py-6 text-center text-amber-400">
            Campaign details cannot be modified once launched or completed.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {serverError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">
                {serverError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Campaign Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                placeholder="e.g. Rainy Season Reforestation"
              />
              {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                placeholder="Describe your campaign objectives..."
              />
              {errors.description && (
                <p className="text-red-400 text-xs mt-1">{errors.description}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Goal Amount (Tokens)
              </label>
              <input
                type="text"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                placeholder="1000"
              />
              {errors.goalAmount && (
                <p className="text-red-400 text-xs mt-1">{errors.goalAmount}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Deadline
              </label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
              {errors.deadline && (
                <p className="text-red-400 text-xs mt-1">{errors.deadline}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
