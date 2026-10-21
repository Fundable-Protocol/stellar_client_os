"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignSocialScheduler } from "@/components/campaign/CampaignSocialScheduler";

export default function CampaignSocialSchedulerPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      {/* Top Navigation */}
      <div>
        <Link href="/campaigns">
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Campaigns
          </Button>
        </Link>
      </div>

      {/* Social Media Post Scheduler */}
      <CampaignSocialScheduler />
    </div>
  );
}
