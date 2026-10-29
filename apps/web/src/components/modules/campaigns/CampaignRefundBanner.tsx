"use client";

import { useState } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

import { useWallet } from "@/providers/StellarWalletProvider";
import { claimCampaignRefund } from "@/services/campaign-refund.service";
import {
  CAMPAIGN_FUNDING_CONTRACT_ID,
  NETWORK_PASSPHRASE,
  SOROBAN_RPC_URL,
} from "@/lib/constants";

export interface CampaignRefundBannerProps {
  campaignId: string;
  status: string;
  totalRaised: string;
  minTarget: string;
  deadline: number;
  contractId?: string;
}

export function CampaignRefundBanner({
  campaignId,
  status,
  totalRaised,
  minTarget,
  deadline,
  contractId = CAMPAIGN_FUNDING_CONTRACT_ID,
}: CampaignRefundBannerProps) {
  const { address, isConnected, openModal, signTransaction } = useWallet();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  const raised = Number(totalRaised);
  const minimum = Number(minTarget);
  const deadlinePassed = Date.now() / 1000 >= deadline;
  const missedSoftCap = Number.isFinite(raised) && Number.isFinite(minimum) && raised < minimum;
  const isRefundable = status === "Failed" || (status === "Active" && deadlinePassed && missedSoftCap);

  if (!isRefundable) return null;

  const claimRefund = async () => {
    setMessage(null);
    if (!isConnected || !address) {
      openModal();
      setMessage("Connect your wallet to claim your full pledge.");
      return;
    }
    if (!signTransaction) {
      setMessage("Wallet signing is unavailable. Reconnect your wallet and try again.");
      return;
    }
    if (!contractId) {
      setMessage("Refund claims are not configured for this deployment.");
      return;
    }
    if (!/^\d+$/.test(campaignId)) {
      setMessage("This campaign does not have a valid on-chain campaign ID.");
      return;
    }

    setIsSubmitting(true);
    try {
      await claimCampaignRefund({
        contractId,
        contributor: address,
        campaignId: BigInt(campaignId),
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: SOROBAN_RPC_URL,
        signTransaction,
      });
      setClaimed(true);
      setMessage("Your full pledge was refunded directly from the campaign contract.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Refund failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      aria-label="Campaign refund"
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/40 bg-amber-950/40 p-5"
      data-testid="campaign-refund-banner"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-bold text-amber-100">Campaign did not reach its minimum goal</h2>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
            Claim your full pledged balance directly from the contract. No platform fee is deducted.
          </p>
          {message && <p className="mt-2 text-xs text-amber-100" role="status">{message}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={claimRefund}
        disabled={isSubmitting || claimed}
        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-amber-300 px-4 py-2 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        {isSubmitting ? "Submitting..." : claimed ? "Refund Claimed" : "Claim Refund"}
      </button>
    </section>
  );
}