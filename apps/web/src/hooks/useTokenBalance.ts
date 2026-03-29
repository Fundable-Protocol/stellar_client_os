"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/providers/StellarWalletProvider";
import { fetchAccountInfo } from "@/lib/api";
import { type AccountInfo } from "@/services";

interface UseTokenBalanceOptions {
    token?: string;
    enabled?: boolean;
}

interface UseTokenBalanceReturn {
    balance: string;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}

/**
 * Hook for fetching and managing token balance for a specific token
 * Uses TanStack Query for caching and async state management
 */
export function useTokenBalance(options: UseTokenBalanceOptions = {}): UseTokenBalanceReturn {
    const { address, isConnected } = useWallet();
    const { token = "USDC", enabled = true } = options;

    const { data: accountInfo, isLoading, error, refetch } = useQuery({
        queryKey: ["wallet-balance", address],
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
            if (!address || !isConnected) return null;
            return fetchAccountInfo(address, signal);
        },
        enabled: enabled && isConnected && !!address,
        staleTime: 30_000,
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    });

    const balance = useMemo(() => {
        if (!accountInfo) return "0";
        
        // Find balance for the selected token
        const balance = accountInfo.balances.find((b: AccountBalance) => 
            b.assetCode === token || (token === "XLM" && b.assetType === "native")
        );
        
        return balance?.balance || "0";
    }, [accountInfo, token]);

    return {
        balance,
        isLoading,
        error: error as Error | null,
        refetch,
    };
}
