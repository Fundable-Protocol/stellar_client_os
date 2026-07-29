"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/providers/StellarWalletProvider";
import { StellarService } from "@/services/stellar.service";
import { extractBalances } from "@/services/transform-balances";
import { WalletNetwork } from "@creit.tech/stellar-wallets-kit";
import type { TokenBalanceData } from "@/types/token-balance.types";

/**
 * Hook that fetches and caches token balances for the connected wallet.
 * Shares the same react-query cache key as TokenBalanceList so data is
 * never fetched twice.
 */
export function useTokenBalances() {
  const { address, isConnected, network } = useWallet();

  const { data: balances, isLoading, error } = useQuery<TokenBalanceData[] | null>({
    queryKey: ["token-balances", address, network],
    queryFn: async ({ signal }: { signal?: AbortSignal }) => {
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
        contracts: { paymentStream: "", distributor: "" },
      });

      try {
        const accountInfo = await stellarService.getAccount(address, signal);
        return extractBalances(accountInfo);
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          (("name" in err && err.name === "AccountNotFoundError") ||
            ("status" in err && (err as { status: number }).status === 404))
        ) {
          return [];
        }
        throw err;
      }
    },
    enabled: isConnected && !!address,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 2,
  });

  return { balances: balances ?? [], isLoading, error };
}

/**
 * Returns the balance string for a given token code (e.g. "XLM", "USDC").
 * Returns null while loading or if the token isn't held.
 */
export function useTokenBalance(tokenCode: string | undefined) {
  const { balances, isLoading } = useTokenBalances();

  if (!tokenCode || isLoading) return { balance: null, isLoading };

  const entry = balances.find(
    (b: TokenBalanceData) => Boolean(b && b.assetCode && b.assetCode.toUpperCase() === tokenCode.toUpperCase())
  );

  return { balance: entry?.balance ?? null, isLoading };
}
