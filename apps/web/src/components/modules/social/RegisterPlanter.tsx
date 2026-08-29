"use client";

import { useRegisterPlanter, useReferrals } from "@/hooks/use-referrals";
import { useWallet } from "@/providers/StellarWalletProvider";
import { Button } from "@/components/ui/button";
import { Seedling, CheckCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { notify } from "@/utils/notification";

function RegisterPlanterInner() {
  const { address } = useWallet();
  const { isRegistered, isLoading } = useReferrals();
  const { register, isRegistering } = useRegisterPlanter();
  const searchParams = useSearchParams();
  const referrerFromUrl = searchParams.get("referrer");

  if (isLoading) {
    return null;
  }

  if (isRegistered) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-semibold text-white">You&apos;re a Planter!</h3>
        </div>
        <p className="text-sm text-zinc-400">
          You&apos;re registered on the platform. Complete jobs and refer friends to earn rewards.
        </p>
      </div>
    );
  }

  const handleRegister = () => {
    register(referrerFromUrl || undefined, {
      onSuccess: () => {
        notify.success("Successfully registered as a planter!");
      },
      onError: (error) => {
        notify.error(`Registration failed: ${error.message}`);
      },
    });
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-3">
        <Seedling className="w-5 h-5 text-fundable-purple-2" />
        <h3 className="text-lg font-semibold text-white">Become a Planter</h3>
      </div>
      <p className="text-sm text-zinc-400 mb-4">
        Register as a planter to start completing jobs and earning referral rewards.
        {referrerFromUrl && (
          <span className="block mt-1 text-fundable-purple-2">
            Referred by a friend — you&apos;ll help them earn 2 XLM when you complete your first job!
          </span>
        )}
      </p>
      <Button
        onClick={handleRegister}
        disabled={!address || isRegistering}
        className="bg-fundable-purple-2 hover:bg-fundable-purple-2/80 text-white"
      >
        {isRegistering ? "Registering..." : "Register as Planter"}
      </Button>
    </div>
  );
}

export default function RegisterPlanter() {
  return (
    <Suspense fallback={null}>
      <RegisterPlanterInner />
    </Suspense>
  );
}
