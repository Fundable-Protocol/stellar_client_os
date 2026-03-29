"use client";

import { TokenBalanceList } from "@/components/token-balance";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ErrorFallback } from "@/components/ui/error-fallback";

export default function BalancesPage() {
  return (
    <div className="min-h-screen bg-zinc-950 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-50 mb-2">
            Token Balances
          </h1>
          <p className="text-zinc-400">
            View all your Stellar token balances in one place
          </p>
        </div>

        <ErrorBoundary
          boundaryName="token-balances-module"
          fallback={({ error, reset }) => (
            <ErrorFallback
              title="Token Balances Unavailable"
              description="We couldn't render the balances section."
              error={error}
              onRetry={reset}
              className="max-w-2xl"
            />
          )}
        >
          <TokenBalanceList className="max-w-2xl" />
        </ErrorBoundary>
      </div>
    </div>
  );
}
