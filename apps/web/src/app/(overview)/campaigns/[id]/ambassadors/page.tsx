"use client";

/**
 * /campaigns/[id]/ambassadors
 *
 * Creator dashboard for the ambassador & influencer program: recruit
 * ambassadors by email, track the pledges they bring in and assign rewards
 * automatically when a tier threshold is reached.
 */

import React, { use } from "react";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { AmbassadorDashboard } from "@/components/modules/campaign/ambassadors/AmbassadorDashboard";
import { useWallet } from "@/providers/StellarWalletProvider";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CampaignAmbassadorsPage({ params }: PageProps) {
  const { id: campaignId } = use(params);
  const { address } = useWallet();

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href={`/campaigns/${campaignId}`}
            className="text-zinc-500 transition-colors hover:text-zinc-200"
            aria-label="Back to campaign"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-50">
              <Users className="h-6 w-6 text-purple-400" /> Ambassador program
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              Recruit ambassadors, track their pledges and reward them automatically.
            </p>
          </div>
        </div>

        <AmbassadorDashboard campaignId={campaignId} creatorAddress={address ?? ""} />
      </div>
    </div>
  );
}
