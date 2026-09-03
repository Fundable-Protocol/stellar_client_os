"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/providers/StellarWalletProvider";
import { socialService } from "@/services/social.service";
import { useCallback } from "react";

const SOCIAL_QUERY_KEY = "social";

/**
 * Hook to fetch the current user's planter info and referral info.
 * Returns planter registration status, referral stats, and reward info.
 */
export function useReferrals() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  // Fetch planter info
  const {
    data: planterInfo,
    isLoading: isLoadingPlanter,
    error: planterError,
  } = useQuery({
    queryKey: [SOCIAL_QUERY_KEY, "planter", address],
    queryFn: () => socialService.getPlanter(address!),
    enabled: !!address,
  });

  // Fetch referral info
  const {
    data: referralInfo,
    isLoading: isLoadingReferrals,
    error: referralError,
  } = useQuery({
    queryKey: [SOCIAL_QUERY_KEY, "referrals", address],
    queryFn: () => socialService.getReferralInfo(address!),
    enabled: !!address,
  });

  // Fetch reward amount
  const {
    data: rewardAmount,
    isLoading: isLoadingReward,
  } = useQuery({
    queryKey: [SOCIAL_QUERY_KEY, "rewardAmount"],
    queryFn: () => socialService.getRewardAmount(),
    enabled: !!address,
  });

  const isLoading = isLoadingPlanter || isLoadingReferrals || isLoadingReward;
  const error = planterError || referralError;

  return {
    planterInfo,
    referralInfo,
    rewardAmount,
    isLoading,
    error,
    isRegistered: !!planterInfo,
    pendingRewards:
      referralInfo
        ? Number(referralInfo.referral_count - referralInfo.successful_referrals)
        : 0,
  };
}

/**
 * Hook to register as a planter.
 */
export function useRegisterPlanter() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (referrerAddress?: string) =>
      socialService.registerPlanter(address!, referrerAddress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SOCIAL_QUERY_KEY] });
    },
  });

  return {
    register: mutation.mutate,
    isRegistering: mutation.isPending,
    registrationError: mutation.error,
    registrationSuccess: mutation.isSuccess,
  };
}

/**
 * Hook to claim a referral reward.
 */
export function useReferralRewardClaim() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      referrerAddress,
      referredPlanterAddress,
    }: {
      referrerAddress: string;
      referredPlanterAddress: string;
    }) => socialService.claimReferralReward(referrerAddress, referredPlanterAddress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SOCIAL_QUERY_KEY] });
    },
  });

  return {
    claimReward: mutation.mutate,
    isClaiming: mutation.isPending,
    claimError: mutation.error,
    claimSuccess: mutation.isSuccess,
  };
}

/**
 * Build the referral URL for sharing.
 */
export function useReferralUrl() {
  const { address } = useWallet();

  const getReferralUrl = useCallback(
    (baseOrigin?: string) => {
      if (!address) return "";
      const origin = baseOrigin || (typeof window !== "undefined" ? window.location.origin : "");
      return `${origin}?referrer=${address}`;
    },
    [address],
  );

  return { referralUrl: address ? getReferralUrl() : "", getReferralUrl };
}
