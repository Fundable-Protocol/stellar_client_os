"use client";

/**
 * /campaigns/[id]/updates
 *
 * Creator dashboard for campaign update posts: write, publish and archive
 * the rich-text updates that keep backers informed during and after a
 * campaign.
 */

import React, { use } from "react";
import Link from "next/link";
import { ArrowLeft, Megaphone } from "lucide-react";
import { CampaignUpdateManager } from "@/components/modules/campaign/updates/CampaignUpdateManager";
import { useWallet } from "@/providers/StellarWalletProvider";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CampaignUpdatesPage({ params }: PageProps) {
  const { id: campaignId } = use(params);
  const { address } = useWallet();

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="mx-auto max-w-4xl px-4 py-8">
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
              <Megaphone className="h-6 w-6 text-purple-400" /> Campaign updates
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              Publish progress notes and notify your backers by email and in-app.
            </p>
          </div>
        </div>

        <CampaignUpdateManager
          campaignId={campaignId}
          creatorAddress={address ?? ""}
        />
      </div>
    </div>
  );
}
