"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/providers/StellarWalletProvider";
import { CampaignReviews } from "@/components/modules/campaign/reviews/CampaignReviews";

interface BackedCampaign {
  id: string;
  name: string;
}

export function BackerTestimonialsDashboard() {
  const { address } = useWallet();
  const [result, setResult] = useState<{
    address: string;
    campaigns: BackedCampaign[];
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!address) return;
    let active = true;
    fetch(`/api/backer/testimonials?backerAddress=${encodeURIComponent(address)}`)
      .then(async (response) => {
        const body = (await response.json()) as { campaigns?: BackedCampaign[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not load your backed campaigns.");
        if (active) setResult({ address, campaigns: body.campaigns ?? [] });
      })
      .catch((cause: unknown) => {
        if (active) setResult({
          address,
          campaigns: [],
          error: cause instanceof Error ? cause.message : "Could not load your backed campaigns.",
        });
      });
    return () => {
      active = false;
    };
  }, [address]);

  const loading = Boolean(address) && result?.address !== address;
  const error = address && result?.address === address ? result.error : null;
  const visibleCampaigns = address && result?.address === address ? result.campaigns : [];

  return (
    <section aria-label="Your backer testimonials" className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-100">Share your campaign experience</h2>
        <p className="mt-1 text-sm text-zinc-400">Leave a star rating and a short testimonial for campaigns you have backed. Creators review submissions before they appear publicly.</p>
      </div>
      {!address && <p className="text-sm text-zinc-400">Connect your wallet to see campaigns you have backed.</p>}
      {loading && <p className="text-sm text-zinc-400">Loading your backed campaigns…</p>}
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      {address && !loading && !error && campaigns.length === 0 && (
        <p className="text-sm text-zinc-400">Back a campaign to share a testimonial here.</p>
      )}
      {visibleCampaigns.map((campaign) => (
        <article key={campaign.id} className="space-y-3 border-t border-zinc-800 pt-4">
          <h3 className="font-semibold text-zinc-100">{campaign.name}</h3>
          <CampaignReviews campaignId={campaign.id} viewerAddress={address ?? undefined} />
        </article>
      ))}
    </section>
  );
}
