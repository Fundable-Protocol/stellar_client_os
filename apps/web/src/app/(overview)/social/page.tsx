"use client";

import DashboardLayout from "@/components/layouts/DashboardLayout";
import ProtectedRoute from "@/components/layouts/ProtectedRoute";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ErrorFallback } from "@/components/ui/error-fallback";
import ReferralStats from "@/components/modules/social/ReferralStats";
import ReferralLink from "@/components/modules/social/ReferralLink";
import ClaimRewards from "@/components/modules/social/ClaimRewards";
import RegisterPlanter from "@/components/modules/social/RegisterPlanter";
import { PLANTER_CONTRACT_ID } from "@/lib/constants";

const SocialPage = () => {
  if (!PLANTER_CONTRACT_ID) {
    return (
      <DashboardLayout title="Referrals" className="flex flex-col gap-y-6 h-full">
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <p className="text-zinc-400 text-lg">
            Referral rewards are not yet available.
          </p>
          <p className="text-zinc-500 text-sm mt-2">
            The planter contract has not been deployed yet. Check back later.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Referrals"
      className="flex flex-col gap-y-6 h-full bg-transparent"
    >
      <ProtectedRoute
        description="Connect your Stellar wallet to view referral rewards."
      >
        <ErrorBoundary
          boundaryName="referral-register"
          fallback={({ error, reset }) => (
            <ErrorFallback
              title="Registration Unavailable"
              description="We couldn't load your planter status."
              error={error}
              onRetry={reset}
            />
          )}
        >
          <RegisterPlanter />
        </ErrorBoundary>

        <ErrorBoundary
          boundaryName="referral-stats"
          fallback={({ error, reset }) => (
            <ErrorFallback
              title="Stats Unavailable"
              description="We couldn't load your referral stats."
              error={error}
              onRetry={reset}
            />
          )}
        >
          <ReferralStats />
        </ErrorBoundary>

        <ErrorBoundary
          boundaryName="referral-link"
          fallback={({ error, reset }) => (
            <ErrorFallback
              title="Link Unavailable"
              description="We couldn't load your referral link."
              error={error}
              onRetry={reset}
            />
          )}
        >
          <ReferralLink />
        </ErrorBoundary>

        <ErrorBoundary
          boundaryName="referral-claim"
          fallback={({ error, reset }) => (
            <ErrorFallback
              title="Rewards Unavailable"
              description="We couldn't load your pending rewards."
              error={error}
              onRetry={reset}
            />
          )}
        >
          <ClaimRewards />
        </ErrorBoundary>
      </ProtectedRoute>
    </DashboardLayout>
  );
};

export default SocialPage;
