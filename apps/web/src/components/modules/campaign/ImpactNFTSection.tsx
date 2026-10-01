'use client';

import React from 'react';
import { useCampaignImpactNFT } from '@/hooks/useCampaignImpactNFT';
import { Award, Trees, CloudRain, Users, CheckCircle2, ExternalLink, Loader2, Sparkles } from 'lucide-react';

export interface ImpactNFTSectionProps {
  campaignId: string;
  campaignTitle: string;
  sponsorAddress?: string;
  isCompleted?: boolean;
}

export function ImpactNFTSection({
  campaignId,
  campaignTitle,
  sponsorAddress,
  isCompleted = false,
}: ImpactNFTSectionProps) {
  const {
    completionNFT,
    personalImpactNFT,
    isLoading,
    isMintingCompletion,
    isMintingPersonal,
    error,
    mintCompletionNFT,
    mintPersonalImpactNFT,
  } = useCampaignImpactNFT(campaignId, sponsorAddress);

  return (
    <div className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-md" data-testid="impact-nft-section">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Award className="h-6 w-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Impact NFTs</h2>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              On-Chain Verified
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Immutable proof of environmental achievement and personal sponsorship on Stellar.
          </p>
        </div>

        {isCompleted && !completionNFT && (
          <button
            onClick={() => void mintCompletionNFT()}
            disabled={isMintingCompletion}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:brightness-110 disabled:opacity-50"
            data-testid="mint-completion-nft-btn"
          >
            {isMintingCompletion ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Minting Completion NFT...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Mint Completion NFT
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300" data-testid="impact-nft-error">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-zinc-500">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2 text-sm">Loading Impact NFTs...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 1. Official Campaign Completion NFT */}
          <div className="flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-5 shadow-inner" data-testid="campaign-completion-nft-card">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Campaign Completion NFT
                </span>
                {completionNFT ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Minted
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500">
                    {isCompleted ? 'Ready to mint' : 'Awaiting completion'}
                  </span>
                )}
              </div>

              <h3 className="mt-2 text-lg font-semibold text-white">
                {completionNFT ? completionNFT.campaignTitle : campaignTitle}
              </h3>

              {completionNFT ? (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3 text-center">
                      <div className="flex items-center justify-center text-emerald-400">
                        <Trees className="h-4 w-4" />
                      </div>
                      <div className="mt-1 text-base font-bold text-white" data-testid="nft-total-trees">
                        {completionNFT.totalTrees.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-zinc-400">Total Trees</div>
                    </div>

                    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3 text-center">
                      <div className="flex items-center justify-center text-teal-400">
                        <CloudRain className="h-4 w-4" />
                      </div>
                      <div className="mt-1 text-base font-bold text-white" data-testid="nft-total-co2">
                        {completionNFT.totalCo2Tonnes} t
                      </div>
                      <div className="text-[11px] text-zinc-400">Total CO2</div>
                    </div>

                    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3 text-center">
                      <div className="flex items-center justify-center text-cyan-400">
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="mt-1 text-base font-bold text-white" data-testid="nft-sponsor-count">
                        {completionNFT.sponsorCount}
                      </div>
                      <div className="text-[11px] text-zinc-400">Sponsors</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-zinc-400 border-t border-zinc-850 pt-3">
                    <div className="flex justify-between">
                      <span>Token ID:</span>
                      <span className="font-mono text-zinc-300" data-testid="nft-token-id">
                        {completionNFT.tokenId}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Transaction:</span>
                      <span className="font-mono text-emerald-400 hover:underline">
                        {completionNFT.txHash.slice(0, 10)}...{completionNFT.txHash.slice(-8)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 p-6 text-center">
                  <Trees className="h-8 w-8 text-zinc-600" />
                  <p className="mt-2 text-sm text-zinc-400">
                    {isCompleted
                      ? 'The campaign has completed! Mint the official NFT to record details, total trees, total CO2, and sponsor count.'
                      : 'This NFT is automatically minted upon full campaign completion.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 2. Sponsor Personal Impact NFT */}
          <div className="flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-5 shadow-inner" data-testid="personal-impact-nft-card">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  Sponsor Personal Impact NFT
                </span>
                {personalImpactNFT && (
                  <span className="flex items-center gap-1 text-xs text-cyan-400 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Minted
                  </span>
                )}
              </div>

              <h3 className="mt-2 text-lg font-semibold text-white">
                {personalImpactNFT ? 'Your Personal Impact NFT' : 'Mint Your Personal Impact NFT'}
              </h3>

              {personalImpactNFT ? (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3 text-center">
                      <div className="flex items-center justify-center text-emerald-400">
                        <Trees className="h-4 w-4" />
                      </div>
                      <div className="mt-1 text-base font-bold text-white" data-testid="personal-trees">
                        {personalImpactNFT.personalTrees}
                      </div>
                      <div className="text-[11px] text-zinc-400">My Trees</div>
                    </div>

                    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3 text-center">
                      <div className="flex items-center justify-center text-teal-400">
                        <CloudRain className="h-4 w-4" />
                      </div>
                      <div className="mt-1 text-base font-bold text-white" data-testid="personal-co2">
                        {personalImpactNFT.personalCo2Tonnes} t
                      </div>
                      <div className="text-[11px] text-zinc-400">My CO2 Offset</div>
                    </div>

                    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3 text-center">
                      <div className="flex items-center justify-center text-amber-400">
                        <Award className="h-4 w-4" />
                      </div>
                      <div className="mt-1 text-base font-bold text-white" data-testid="personal-tier">
                        {personalImpactNFT.tier}
                      </div>
                      <div className="text-[11px] text-zinc-400">Sponsor Tier</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-zinc-400 border-t border-zinc-850 pt-3">
                    <div className="flex justify-between">
                      <span>Contribution Share:</span>
                      <span className="font-semibold text-zinc-200">
                        {personalImpactNFT.contributionSharePercentage}% of campaign
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Token ID:</span>
                      <span className="font-mono text-zinc-300">
                        {personalImpactNFT.tokenId}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 p-6 text-center">
                  <p className="text-sm text-zinc-400">
                    Sponsors of completed campaigns can mint an immutable, personal impact NFT proving their individual contribution.
                  </p>
                  {sponsorAddress ? (
                    <button
                      onClick={() => void mintPersonalImpactNFT()}
                      disabled={isMintingPersonal}
                      className="mt-4 flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-50"
                      data-testid="mint-personal-impact-nft-btn"
                    >
                      {isMintingPersonal ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Minting Personal NFT...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Mint My Personal Impact NFT
                        </>
                      )}
                    </button>
                  ) : (
                    <p className="mt-3 text-xs text-zinc-500 italic">
                      Connect your sponsor wallet to mint your personal impact NFT.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
