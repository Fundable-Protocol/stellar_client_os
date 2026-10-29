import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/providers/StellarWalletProvider";
import { StellarService } from "@/services/stellar.service";
import { extractBalances } from "@/services/transform-balances";
import { WalletNetwork } from "@creit.tech/stellar-wallets-kit";
import type { TokenBalanceData } from "@/types/token-balance.types";

/**
 * Currencies a backer can pledge in. USD and EUR are fiat currencies that are
 * converted to a settlement asset at pledge time; XLM and USDC settle on-chain
 * directly.
 */
export type SupportedCurrency = "USD" | "EUR" | "XLM" | "USDC";

/**
 * Maps a supported currency to the Stellar asset code used for settlement.
 * Fiat currencies settle in USDC; on-chain assets settle as themselves.
 */
export function getSettlementAssetCode(currency: SupportedCurrency): string {
  switch (currency) {
    case "USD":
    case "EUR":
      return "USDC";
    case "XLM":
      return "XLM";
    case "USDC":
      return "USDC";
    default:
      return "USDC";
  }
}

/**
 * Hook that fetches and caches token balances for the connected wallet.
 * Shares the same react-query cache key as TokenBalanceList so data is
 * never fetched twice.
 */
export function useTokenBalances() {
  const { address, isConnected, network } = useWallet();

  const { data: balances, isLoading, error } = useQuery<TokenBalanceData[] | null>({
    queryKey: ["token-balances", address, network],
    queryFn: async ({ signal }) => {
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

      const accountInfo = await stellarService.getAccount(address, signal);
      return extractBalances(accountInfo);
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
 * Includes address and token in the query key to ensure proper cache
 * invalidation when switching wallet accounts or tokens.
 */
export function useTokenBalance(tokenCode: string | undefined) {
  const { address, isConnected } = useWallet();
  const { balances, isLoading } = useTokenBalances();

  const { data: balance } = useQuery<string | null>({
    queryKey: ["token-balance", address, tokenCode],
    queryFn: async () => {
      if (!tokenCode || !balances.length || !address) return null;

      const entry = balances.find(
        (b) => b.assetCode.toUpperCase() === tokenCode.toUpperCase()
      );

      return entry?.balance ?? null;
    },
    enabled: !!tokenCode && isConnected && !!address && !isLoading,
  });

  return { balance: balance ?? null, isLoading };
}

/**
 * Returns the on-chain balance for the asset that settles the given currency.
 * Use this to validate a converted pledge amount against the correct balance
 * (e.g. USD/EUR pledges are checked against the USDC balance).
 */
export function useSettlementBalance(currency: SupportedCurrency | undefined) {
  const assetCode = currency ? getSettlementAssetCode(currency) : undefined;
  const { balance, isLoading } = useTokenBalance(assetCode);

  return { balance, isLoading, assetCode };
}
