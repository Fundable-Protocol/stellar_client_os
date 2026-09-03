"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useReferrals } from "@/hooks/use-referrals";
import { Users, CheckCircle, Clock, Coins } from "lucide-react";

/**
 * Displays the user's referral stats: total referrals, successful referrals, pending rewards, and earned rewards.
 */
export default function ReferralStats() {
  const { referralInfo, rewardAmount, isLoading } = useReferrals();

  const totalReferrals = referralInfo ? Number(referralInfo.referral_count) : 0;
  const successfulReferrals = referralInfo ? Number(referralInfo.successful_referrals) : 0;
  const pendingRewards = totalReferrals - successfulReferrals;
  const earnedXlm = rewardAmount
    ? (Number(rewardAmount) / 10_000_000) * successfulReferrals
    : 0;

  const stats = [
    {
      label: "Total Referrals",
      value: totalReferrals,
      icon: <Users className="w-5 h-5 text-fundable-purple-2" />,
    },
    {
      label: "Successful Referrals",
      value: successfulReferrals,
      icon: <CheckCircle className="w-5 h-5 text-green-400" />,
    },
    {
      label: "Pending Rewards",
      value: pendingRewards,
      icon: <Clock className="w-5 h-5 text-yellow-400" />,
    },
    {
      label: "Earned (XLM)",
      value: earnedXlm.toFixed(2),
      icon: <Coins className="w-5 h-5 text-blue-400" />,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-2">
            {stat.icon}
            <p className="text-sm text-zinc-400">{stat.label}</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-16 bg-zinc-800" />
          ) : (
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          )}
        </div>
      ))}
    </div>
  );
}
