"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useWallet } from "@/providers/StellarWalletProvider";
import { WalletNetwork } from "@creit.tech/stellar-wallets-kit";
import {
  readCampaignRecommendationPreferences,
  readViewedCampaignIds,
  type CampaignRecommendationPreferences,
} from "@/lib/campaign-recommendation-preferences";

interface RecommendedCampaign {
  id: string;
  creator: string;
  totalRaised: string;
  species?: readonly string[];
  location?: string;
  environmentalCauses?: readonly string[];
  score: number;
  reasons: string[];
}

interface RecommendationsResponse {
  data: RecommendedCampaign[];
}

export function PersonalizedCampaignRecommendations() {
  const { address, network } = useWallet();
  const [campaigns, setCampaigns] = useState<RecommendedCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!address) {
      setCampaigns([]);
      return;
    }

    let cancelled = false;
    const preferences: CampaignRecommendationPreferences =
      readCampaignRecommendationPreferences(address);
    const params = new URLSearchParams({
      address,
      limit: "6",
      network: network === WalletNetwork.PUBLIC ? "mainnet" : "testnet",
      species: preferences.species.join(","),
      geographicInterests: preferences.geographicInterests.join(","),
      environmentalCauses: preferences.environmentalCauses.join(","),
      viewedCampaignIds: readViewedCampaignIds(address).join(","),
    });

    setLoading(true);
    setError("");
    fetch(`/api/campaigns/recommendations?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Unable to load campaign recommendations.");
        }
        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== "object" ||
          !("data" in result) ||
          !Array.isArray(result.data)
        ) {
          throw new Error("The recommendation service returned an invalid response.");
        }
        return result as RecommendationsResponse;
      })
      .then((result) => {
        if (!cancelled) setCampaigns(result.data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Unable to load campaign recommendations.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, network]);

  if (!address) return null;

  return (
    <section
      aria-labelledby="personalized-recommendations-heading"
      className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-fundable-purple-2" aria-hidden="true" />
            <h2 id="personalized-recommendations-heading" className="text-xl font-bold text-zinc-950 dark:text-white">
              Recommended for you
            </h2>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Suggestions informed by your backing history, campaign views, and interests.
          </p>
        </div>
        <Link href="/settings/recommendations" className="shrink-0 text-sm font-medium text-fundable-purple-2 hover:underline">
          Tune preferences
        </Link>
      </div>

      {loading && <p role="status" className="mt-5 text-sm text-zinc-500">Finding campaigns for you…</p>}
      {error && <p role="alert" className="mt-5 text-sm text-red-600">{error}</p>}
      {!loading && !error && campaigns.length === 0 && (
        <p className="mt-5 text-sm text-zinc-500">No recommendations are available right now. Explore campaigns to personalize your shelf.</p>
      )}
      {campaigns.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <article key={campaign.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-fundable-purple-2">
                {campaign.species?.slice(0, 2).join(" · ") || campaign.environmentalCauses?.[0] || "Impact campaign"}
              </p>
              <h3 className="mt-2 font-semibold text-zinc-950 dark:text-white">
                <Link href={`/campaigns/${campaign.id}`} className="hover:underline">
                  Campaign {campaign.id}
                </Link>
              </h3>
              {campaign.location && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{campaign.location}</p>}
              <p className="mt-2 text-xs text-zinc-500">
                {campaign.reasons[0] ?? "A popular active campaign"}
              </p>
              <Link href={`/campaigns/${campaign.id}`} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-fundable-purple-2 hover:underline">
                Explore campaign <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
