"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CampaignDonationPanel } from "@/components/modules/campaign/donation/CampaignDonationPanel";

/**
 * One-time charitable donation page (issue #1001).
 *
 * Unlike the tree-selection sponsorship flow, a donation here is handed to the
 * campaign creator's discretion so it can be spent on project costs.
 */
export default function CampaignDonatePage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <Link
        href={`/campaigns/${id}`}
        className="inline-flex items-center text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to campaign
      </Link>

      <header className="mt-6">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">Make a one-time donation</h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-400">
          Contribute to this campaign without buying specific trees. Your donation is placed at the
          creator&apos;s discretion to cover project costs, and you&apos;ll receive a receipt to keep.
        </p>
      </header>

      <div className="mt-8">
        <CampaignDonationPanel campaignId={String(id)} />
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
