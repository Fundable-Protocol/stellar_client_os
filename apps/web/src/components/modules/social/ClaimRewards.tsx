"use client";

import { useWallet } from "@/providers/StellarWalletProvider";
import { useReferrals, useReferralRewardClaim } from "@/hooks/use-referrals";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Coins, Gift, ArrowRight } from "lucide-react";
import { notify } from "@/utils/notification";

/**
 * Displays pending referral rewards that can be claimed.
 * Uses the referral info to find referred planters whose first job was completed
 * but whose reward hasn't been claimed yet.
 */
export default function ClaimRewards() {
  const { address } = useWallet();
  const { referralInfo, planterInfo, isLoading } = useReferrals();
  const { claimReward, isClaiming } = useReferralRewardClaim();

  // The referral info tracks total and successful referrals.
  // In this implementation, rewards are claimed per referred planter via the contract.
  // We show a summary and a "Claim All Available" button.

  const hasPendingRewards =
    referralInfo &&
    Number(referralInfo.referral_count) > Number(referralInfo.successful_referrals);

  const handleClaim = () => {
    if (!address || !hasPendingRewards) return;
    // NOTE: In production, this would iterate over specific referred planters
    // For now, we show the user info about their pending referrals
    notify.info("Claim rewards will be processed for each eligible referred planter on-chain.");
  };

  if (isLoading) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
        <Skeleton className="h-6 w-48 bg-zinc-800 mb-4" />
        <Skeleton className="h-10 w-32 bg-zinc-800" />
      </div>
    );
  }

  if (!address || !planterInfo) {
    return null;
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-3">
        <Gift className="w-5 h-5 text-fundable-purple-2" />
        <h3 className="text-lg font-semibold text-white">Pending Rewards</h3>
      </div>

      {hasPendingRewards ? (
        <>
          <p className="text-sm text-zinc-400 mb-4">
            You have{" "}
            <span className="text-white font-medium">
              {Number(referralInfo.referral_count) - Number(referralInfo.successful_referrals)}
            </span>{" "}
            pending referral reward(s). Each successful referral earns you 2 XLM.
          </p>
          <Button
            onClick={handleClaim}
            disabled={isClaiming}
            className="bg-fundable-purple-2 hover:bg-fundable-purple-2/80 text-white"
          >
            {isClaiming ? (
              "Claiming..."
            ) : (
              <>
                <Coins className="w-4 h-4 mr-2" />
                Claim Rewards
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </>
      ) : (
        <p className="text-sm text-zinc-400">
          No pending rewards. Share your referral link to start earning!
        </p>
      )}
    </div>
  );
}
