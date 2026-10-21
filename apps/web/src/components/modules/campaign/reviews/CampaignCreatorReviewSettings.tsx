"use client";

import Link from "next/link";
import { useWallet } from "@/providers/StellarWalletProvider";
import { CampaignReviewModeration } from "./CampaignReviewModeration";

export function CampaignCreatorReviewSettings({
  campaignId,
  creatorAddress,
}: {
  campaignId: string;
  creatorAddress: string;
}) {
  const { address } = useWallet();
  if (!address || address.toLowerCase() !== creatorAddress.toLowerCase()) return null;

  return (
    <div className="mt-6 space-y-4 border-t border-zinc-800 pt-5">
      <CampaignReviewModeration campaignId={campaignId} creatorAddress={address} />
      <Link
        href={`/campaigns/${campaignId}/settings/thank-you`}
        className="inline-flex rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-purple-500 hover:text-white"
      >
        Customize post-pledge thank-you page
      </Link>
    </div>
  );
}
