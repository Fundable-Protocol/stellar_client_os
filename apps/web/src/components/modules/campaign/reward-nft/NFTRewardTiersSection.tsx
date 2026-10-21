"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, Gift, CheckCircle2, Plus, ExternalLink, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/providers/StellarWalletProvider";
import { NFTRewardTierItem, NFTRewardAirdropRecord } from "@/types/campaign-reward-nft";
import { CreatorNFTRewardTierModal } from "./CreatorNFTRewardTierModal";

export interface NFTRewardTiersSectionProps {
  campaignId: string;
  creatorAddress?: string;
  isCreator?: boolean;
  campaignStatus?: string;
  isClosed?: boolean;
}

export function NFTRewardTiersSection({
  campaignId,
  creatorAddress,
  isCreator: initialIsCreator,
  campaignStatus = "ACTIVE",
  isClosed = false,
}: NFTRewardTiersSectionProps) {
  const { address, isConnected } = useWallet();
  const isCreator = initialIsCreator ?? (isConnected && address && creatorAddress && address.toLowerCase() === creatorAddress.toLowerCase());

  const [tiers, setTiers] = useState<NFTRewardTierItem[]>([]);
  const [airdrops, setAirdrops] = useState<NFTRewardAirdropRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [airdropping, setAirdropping] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load tiers & airdrops
  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        setLoading(true);
        const [tiersRes, airdropsRes] = await Promise.all([
          fetch(`/api/campaigns/${campaignId}/nft-rewards`),
          fetch(
            address
              ? `/api/campaigns/${campaignId}/nft-rewards/airdrop?backerAddress=${address}`
              : `/api/campaigns/${campaignId}/nft-rewards/airdrop`
          ),
        ]);

        const tiersData = await tiersRes.json();
        const airdropsData = await airdropsRes.json();

        if (active) {
          if (tiersData.success && Array.isArray(tiersData.nftRewardTiers)) {
            setTiers(tiersData.nftRewardTiers);
          }
          if (airdropsData.success && Array.isArray(airdropsData.airdrops)) {
            setAirdrops(airdropsData.airdrops);
          }
        }
      } catch (err) {
        console.error("Failed to load NFT reward tiers:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [campaignId, address]);

  const handleTriggerAirdrop = async () => {
    try {
      setAirdropping(true);
      setStatusMessage(null);
      const res = await fetch(`/api/campaigns/${campaignId}/nft-rewards/airdrop`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to process airdrop");
      }

      setStatusMessage(`Successfully minted and delivered ${data.result.totalAirdropped} reward NFTs on Stellar!`);
      // Refresh airdrops
      const refreshed = await fetch(`/api/campaigns/${campaignId}/nft-rewards/airdrop`);
      const rData = await refreshed.json();
      if (rData.success) {
        setAirdrops(rData.airdrops);
      }
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Error executing airdrop");
    } finally {
      setAirdropping(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-950 dark:text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Stellar-Native NFT Reward Tiers
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Creators offer exclusive digital assets automatically minted on Stellar and airdropped to connected backer wallets on campaign close.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isCreator && (
            <Button
              onClick={() => setModalOpen(true)}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add NFT Reward Tier
            </Button>
          )}

          {(isCreator || campaignStatus === "COMPLETED" || isClosed) && (
            <Button
              onClick={handleTriggerAirdrop}
              disabled={airdropping}
              size="sm"
              variant="outline"
              className="border-purple-600 text-purple-600 hover:bg-purple-50 dark:border-purple-500 dark:text-purple-400 dark:hover:bg-purple-950/40"
            >
              <Gift className="h-4 w-4 mr-1.5" />
              {airdropping ? "Airdropping..." : "Airdrop to Backers"}
            </Button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-3 text-xs text-purple-700 dark:text-purple-300">
          {statusMessage}
        </div>
      )}

      {/* User Connected Wallet Airdrop Banner */}
      {isConnected && airdrops.length > 0 && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-50/30 dark:border-emerald-900/50 dark:bg-emerald-950/20 p-4">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
            <CheckCircle2 className="h-4 w-4" />
            <span>Reward NFT Delivered to Your Wallet!</span>
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            Your connected address ({address?.slice(0, 6)}...{address?.slice(-4)}) has received {airdrops.length} commemorative Stellar NFT(s).
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {airdrops.map((ad) => (
              <div
                key={ad.id}
                className="flex items-center gap-3 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-white dark:bg-zinc-900 p-2 text-xs"
              >
                {ad.assetUrl && (
                  <img src={ad.assetUrl} alt={ad.tierName} className="h-10 w-10 rounded object-cover" />
                )}
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{ad.tierName}</p>
                  <p className="text-[11px] text-zinc-500">Token ID: {ad.tokenId}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-3 w-3" /> Stellar On-Chain Verified
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tier Cards Grid */}
      {loading ? (
        <div className="py-8 text-center text-sm text-zinc-500">Loading NFT reward tiers...</div>
      ) : tiers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 p-8 text-center">
          <Gift className="mx-auto h-8 w-8 text-zinc-400 mb-2" />
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No NFT reward tiers configured yet.</p>
          <p className="mt-1 text-xs text-zinc-500">
            {isCreator
              ? "Click 'Add NFT Reward Tier' to upload artwork and set minimum pledge requirements."
              : "Backers will be eligible for exclusive Stellar NFTs once configured."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className="flex flex-col justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm"
            >
              <div>
                <div className="relative aspect-video w-full bg-zinc-100 dark:bg-zinc-800">
                  {tier.asset?.assetUrl ? (
                    <img
                      src={tier.asset.assetUrl}
                      alt={tier.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-400">
                      <Sparkles className="h-8 w-8" />
                    </div>
                  )}
                  <Badge className="absolute top-2 right-2 bg-purple-600 text-white text-[10px]">
                    Stellar NFT
                  </Badge>
                </div>

                <div className="p-4 space-y-2">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">{tier.name}</h3>
                  {tier.description && (
                    <p className="text-xs text-zinc-500 line-clamp-2">{tier.description}</p>
                  )}

                  <div className="pt-2 flex items-baseline justify-between">
                    <div>
                      {tier.earlyBirdPricing && 
                       tier.earlyBirdPricing.claimedCount !== undefined &&
                       tier.earlyBirdPricing.claimedCount < tier.earlyBirdPricing.earlyBirdLimit ? (
                        <>
                          <Badge className="mb-1 bg-amber-500 text-white text-[10px]">
                            🔥 Early Bird {tier.earlyBirdPricing.earlyBirdLimit - tier.earlyBirdPricing.claimedCount} left!
                          </Badge>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400 line-through">
                              {tier.minimumPledge} {tier.token}
                            </span>
                            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                              {(parseFloat(tier.minimumPledge) * (1 - tier.earlyBirdPricing.discountPercent / 100)).toFixed(2)}{" "}
                              <span className="text-xs text-zinc-500">{tier.token}</span>
                              <span className="text-xs font-normal text-amber-600 ml-1">
                                (-{tier.earlyBirdPricing.discountPercent}%)
                              </span>
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-zinc-400">Eligible pledge from</span>
                          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            {tier.minimumPledge} <span className="text-xs text-zinc-500">{tier.token}</span>
                          </p>
                        </>
                      )}
                    </div>

                    {tier.maxSupply ? (
                      <span className="text-xs text-zinc-500">
                        Cap: {tier.claimedCount ?? 0}/{tier.maxSupply}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">Open Supply</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-zinc-100 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-950/40 text-[11px] text-zinc-500 flex items-center justify-between">
                <span>Airdrop: Auto on campaign close</span>
                <span className="text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1">
                  <Wallet className="h-3 w-3" /> Connected Wallet
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <CreatorNFTRewardTierModal
          campaignId={campaignId}
          creatorAddress={creatorAddress || address || ""}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onCreated={(newTier) => setTiers((prev) => [...prev, newTier])}
        />
      )}
    </div>
  );
}
