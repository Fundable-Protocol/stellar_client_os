"use client";

import { useState } from "react";
import { TokenBalanceListProps } from "@/types/token-balance.types";
import { useWallet } from "@/providers/StellarWalletProvider";
import { TokenBalanceCard } from "./TokenBalanceCard";
import { extractBalances } from "@/services/transform-balances";
import { sortTokenBalances } from "@/utils/sort-token-balances";
import { StellarService } from "@/services/stellar.service";
import {
  NetworkError,
  AccountNotFoundError,
  StellarError,
} from "@/services/errors";
import { WalletNetwork } from "@creit.tech/stellar-wallets-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

/**
 * TokenBalanceList Component
 *
 * A container component that fetches and displays all token balances for the connected account.
 * Manages loading, error, and empty states, and renders TokenBalance components for each token.
 *
 * Features:
 * - Fetches account data from Stellar Horizon API via StellarService
 * - Automatically configures network (testnet/mainnet) based on wallet network
 * - Displays loading state with skeleton components
 * - Handles error states with user-friendly messages and detailed logging
 * - Shows empty state when no tokens are found
 * - Sorts tokens with XLM first, then alphabetically
 * - Integrates with wallet provider for account address and network
 * - Refetches balances when address or network changes
 *
 * Requirements:
 * - 1.1: Fetch account data when address is provided (Requirement 1.1)
 * - 3.1: Render TokenBalance component for each token
 * - 3.2: Display empty state when no tokens
 * - 3.3: Order tokens with XLM first, then alphabetically
 * - 4.1: Display skeleton loading components while fetching
 * - 8.1: React functional component compatible with React 19
 * - 8.2: Use Wallet_Provider to access connected account
 * - 8.3: Use StellarService.getAccount() to fetch balances
 * - 9.1-9.4: Handle errors with user-friendly messages and detailed logging
 *
 * @param props - Component props
 * @param props.className - Optional CSS class name to apply to the container element
 *
 * @example
 * // Basic usage - displays token balances for connected wallet
 * ```tsx
 * <TokenBalanceList />
 * ```
 *
 * @example
 * // With custom styling
 * ```tsx
 * <TokenBalanceList className="max-w-2xl mx-auto" />
 * ```
 *
 * @example
 * // In a dashboard layout
 * ```tsx
 * <div className="dashboard">
 *   <h2>Your Token Balances</h2>
 *   <TokenBalanceList className="mt-4" />
 * </div>
 * ```
 *
 * Expected Behavior:
 * - When no wallet is connected: Displays message prompting user to connect wallet
 * - While loading: Shows 3 skeleton placeholders matching the token balance layout
 * - On error: Displays user-friendly error message with appropriate styling
 * - When empty: Shows "No tokens found" message
 * - On success: Renders a TokenBalance component for each token, sorted with XLM first
 * - Automatically refetches when wallet address or network changes
 */
export function TokenBalanceList({ className = "" }: TokenBalanceListProps) {
  const { address, isConnected, network } = useWallet();
  const queryClient = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { data: balances, isLoading: loading, error, isRefetching } = useQuery({
    queryKey: ["token-balances", address, network],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      if (!address) return null;

      const isTestnet = network === WalletNetwork.TESTNET;
      const stellarService = new StellarService({
        network: {
          networkPassphrase: isTestnet
            ? "Test SDF Network ; September 2015"
            : "Public Global Stellar Network ; September 2015",
          rpcUrl: isTestnet
            ? "https://soroban-testnet.stellar.org"
            : "https://soroban.stellar.org",
          horizonUrl: isTestnet
            ? "https://horizon-testnet.stellar.org"
            : "https://horizon.stellar.org",
        },
        contracts: {
          paymentStream: "",
          distributor: "",
        },
      });

      const accountInfo = await stellarService.getAccount(address, signal);
      const extractedBalances = extractBalances(accountInfo);
      const sortedBalances = sortTokenBalances(extractedBalances);
      
      setLastUpdated(new Date());
      return sortedBalances;
    },
    enabled: isConnected && !!address,
    refetchInterval: 30000, // Auto-refresh every 30s
    refetchIntervalInBackground: false, // Save network requests when tab is inactive
    retry: 2,
  });

  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["token-balances", address, network] });
  };

  // Render: No wallet connected
  if (!isConnected || !address) {
    return (
      <div
        className={`p-6 bg-zinc-800 rounded-lg border border-zinc-700 ${className}`}
      >
        <p className="text-center text-zinc-400">
          Please connect your wallet to view token balances.
        </p>
      </div>
    );
  }

  // Render: Loading state
  if (loading) {
    return (
      <div className={`space-y-3 ${className}`} aria-busy="true" aria-label="Loading token balances">
        {/* Skeleton loading placeholders matching token balance layout */}
        {/* Requirements 4.1, 4.2, 4.3: Use Skeleton component from UI library */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 bg-zinc-800 rounded-lg border border-zinc-700"
          >
            {/* Token icon skeleton */}
            <Skeleton className="shrink-0 w-10 h-10 rounded-full" />
            {/* Token info skeleton */}
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
            {/* Balance skeleton */}
            <div className="shrink-0 space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Render: Error state
  if (error) {
    // Determine user-friendly error message based on error type
    // Requirements 9.1, 9.2, 9.3
    let errorMessage: string;
    let errorTitle: string = "Failed to load token balances";

    if (error instanceof NetworkError) {
      // Requirement 9.2: User-friendly message for network errors
      errorTitle = "Network Error";
      errorMessage =
        "Unable to connect to Stellar network. Please check your connection and try again.";
    } else if (error instanceof AccountNotFoundError) {
      // Requirement 9.3: Appropriate message for invalid addresses
      errorTitle = "Account Not Found";
      errorMessage =
        "This account hasn't been activated on the Stellar network yet. To activate it, you need to fund it with at least 1 XLM. You can get testnet XLM from the Stellar Laboratory friendbot.";
    } else if (error instanceof StellarError) {
      // Handle other Stellar-specific errors
      errorTitle = "Stellar Network Error";
      errorMessage =
        error.message || "An error occurred while fetching balances.";
    } else {
      // Generic error fallback
      errorMessage =
        error.message ||
        "An unexpected error occurred. Please try again later.";
    }

    return (
      <div
        className={`p-6 bg-zinc-800 rounded-lg border border-red-900/50 ${className}`}
      >
        <div className="text-center">
          <p className="text-red-400 font-semibold mb-2">{errorTitle}</p>
          <p className="text-zinc-400 text-sm mb-4">{errorMessage}</p>

          {/* Show helpful action for Account Not Found */}
          {error instanceof AccountNotFoundError && (
            <>
              {network === WalletNetwork.TESTNET ? (
                <a
                  href="https://laboratory.stellar.org/#account-creator?network=test"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-4 py-2 mt-2 text-sm font-medium text-zinc-900 bg-violet-400 rounded-lg hover:bg-violet-500 transition-colors"
                >
                  Fund Account on Testnet
                </a>
              ) : (
                <p className="text-zinc-500 text-sm mt-2">
                  To activate this account, send at least 1 XLM to it from
                  another account.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Render: Empty state
  if (balances && balances.length === 0) {
    return (
      <div
        className={`p-10 bg-zinc-800/50 rounded-lg border border-dashed border-zinc-700 text-center ${className}`}
      >
        <div className="mb-4 flex justify-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-zinc-500" />
            </div>
        </div>
        <h3 className="text-zinc-50 font-medium mb-1">No tokens found</h3>
        <p className="text-zinc-400 text-sm max-w-xs mx-auto mb-6">
          Your account does not have any token balances yet. 
          {network === WalletNetwork.TESTNET 
            ? " Use the Stellar Laboratory to fund your testnet account with XLM." 
            : " Send some XLM to this address to get started."}
        </p>
        
        {network === WalletNetwork.TESTNET && (
          <a
            href="https://laboratory.stellar.org/#account-creator?network=test"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Fund Testnet Account
          </a>
        )}
      </div>
    );
  }

  // Render: Success state with token list
  return (
    <div className={`space-y-4 ${className}`} aria-live="polite" aria-label="Token balances">
      {/* Header with Refresh button and Last Updated timestamp */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Balances</span>
          {lastUpdated && (
            <span className="text-[10px] text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-800/50">
              Updated {format(lastUpdated, "HH:mm:ss")}
            </span>
          )}
        </div>
        <button
          onClick={handleManualRefresh}
          disabled={isRefetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all border border-transparent hover:border-zinc-700 disabled:opacity-50"
          title="Manual refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          {isRefetching ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="space-y-3">
        {balances?.map((balance) => (
          <TokenBalanceCard
            key={`${balance.assetCode}-${balance.assetIssuer || "native"}`}
            assetCode={balance.assetCode}
            assetIssuer={balance.assetIssuer}
            balance={balance.balance}
            iconUrl={balance.iconUrl}
            onRetry={handleManualRefresh}
          />
        ))}
      </div>
    </div>
  );
}
