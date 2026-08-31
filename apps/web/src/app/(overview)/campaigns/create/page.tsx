"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CampaignWizard } from "@/components/modules/campaign/wizard/CampaignWizard";

export default function CreateCampaignPage() {
  const handleComplete = async (data: any) => {
    console.log("Campaign created:", data);
  };

  const handleSaveDraft = async (data: any) => {
    console.log("Campaign draft saved:", data);
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

      <CampaignWizard onComplete={handleComplete} onSaveDraft={handleSaveDraft} />
    </div>
  );
}
