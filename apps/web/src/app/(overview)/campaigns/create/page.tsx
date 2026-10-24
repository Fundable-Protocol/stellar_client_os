"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CampaignWizard } from "@/components/modules/campaign/wizard/CampaignWizard";
import type { CampaignWizardData } from "@/components/modules/campaign/wizard/campaign-wizard-config";
import { useWallet } from "@/providers/StellarWalletProvider";

export default function CreateCampaignPage() {
  const { address } = useWallet();

  const handleComplete = async (data: CampaignWizardData) => {
    if (!address) {
      throw new Error("Connect a wallet before creating a campaign.");
    }
    // Persist the campaign, including category, tags, and milestones,
    // through the campaign creation API.
    const payload = {
      ...data,
      creator: address,
      name: data.title,
      description: data.fullStory,
      category: data?.category ?? null,
      tags: Array.isArray(data?.tags) ? data.tags.slice(0, 10) : [],
      milestones: Array.isArray(data?.milestones) ? data.milestones : [],
    };

    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to create campaign: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Campaign creation failed:", error);
      throw error;
    }
  };

  const handleSaveDraft = async (data: CampaignWizardData) => {
    const payload = {
      ...data,
      category: data?.category ?? null,
      tags: Array.isArray(data?.tags) ? data.tags.slice(0, 10) : [],
      milestones: Array.isArray(data?.milestones) ? data.milestones : [],
    };

    try {
      const response = await fetch("/api/campaigns/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to save campaign draft: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Campaign draft save failed:", error);
      throw error;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/campaigns"
          className="inline-flex items-center text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Campaigns
        </Link>
      </div>

      <CampaignWizard
        onComplete={handleComplete}
        onSaveDraft={handleSaveDraft}
        initialData={{
          category: null,
          tags: [],
          milestones: [],
        }}
      />
    </div>
  );
}