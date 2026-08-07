"use client";

import React from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ErrorFallback } from "@/components/ui/error-fallback";
import { TokenBalance } from "./TokenBalance";
import { TokenBalanceProps } from "@/types/token-balance.types";

export interface TokenBalanceCardProps extends TokenBalanceProps {
  onRetry?: () => void;
}

/**
 * TokenBalanceCard Component
 *
 * Wraps TokenBalance in a granular ErrorBoundary with retry trigger
 * to prevent RPC or rendering failures from crashing the entire page or dashboard route.
 */
export function TokenBalanceCard(props: TokenBalanceCardProps) {
  const { onRetry, ...balanceProps } = props;

  return (
    <ErrorBoundary
      boundaryName="TokenBalanceCard"
      onReset={onRetry}
      fallback={({ error, reset }) => (
        <ErrorFallback
          title="Balance Card Unavailable"
          description="Failed to load token balance card."
          error={error}
          onRetry={reset}
          className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700"
        />
      )}
    >
      <TokenBalance {...balanceProps} />
    </ErrorBoundary>
  );
}

export default TokenBalanceCard;
