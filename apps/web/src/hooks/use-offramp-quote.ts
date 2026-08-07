"use client";

/**
 * useOfframpQuote — Live offramp conversion rate hook (issue #529)
 *
 * Debounces user input and fetches aggregated offramp rates from the
 * offramp service. Returns the live quote, slippage, best provider,
 * and loading / error state so the swap widget can display a real-time
 * conversion preview.
 *
 * @example
 * ```tsx
 * const { quote, isLoading, error, refresh } = useOfframpQuote({
 *   token: "USDC", amount: "100", country: "NG", currency: "NGN",
 * });
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { offrampService } from "@/services/offramp.service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OfframpQuoteParams {
  /** Token to convert (e.g. "USDC", "USDT") */
  token: string;
  /** Amount as a string to avoid precision issues */
  amount: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "NG", "GH") */
  country: string;
  /** Target fiat currency (e.g. "NGN", "GHS") */
  currency: string;
  /** Debounce delay in ms. Default: 500 */
  debounceMs?: number;
  /** Skip fetching when true (e.g. form is invalid) */
  disabled?: boolean;
}

export interface QuoteProvider {
  name: string;
  rate: number;
  fee: number;
  /** Amount the user will receive after fees */
  youReceive: number;
  /** Estimated processing time */
  estimatedTime?: string;
  /** Whether this is the best rate available */
  isBest: boolean;
}

export interface OfframpQuoteResult {
  /** Amount the user entered */
  amountIn: number;
  /** Currency being received */
  currency: string;
  /** Exchange rate (1 token = X fiat) */
  rate: number;
  /** Total fee in fiat currency */
  totalFee: number;
  /** Net amount the user will receive */
  youReceive: number;
  /** Slippage vs the best available rate (0–100%) */
  slippagePercent: number;
  /** All available providers sorted by rate descending */
  providers: QuoteProvider[];
  /** Best provider name */
  bestProvider: string;
  /** ISO 8601 timestamp of when this quote expires */
  expiresAt: string;
}

export interface UseOfframpQuoteReturn {
  quote: OfframpQuoteResult | null;
  isLoading: boolean;
  /** True on the very first fetch (no previous quote yet) */
  isInitialLoading: boolean;
  /** True on subsequent refreshes (previous quote still visible) */
  isRefreshing: boolean;
  error: string | null;
  /** Manually trigger a fresh quote fetch */
  refresh: () => void;
  /** Seconds until the current quote expires (null if no quote) */
  expiresInSeconds: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const QUOTE_TTL_SECONDS = 30;

/**
 * Parse the raw AggregatedRatesResponse into a typed OfframpQuoteResult.
 * The API shape is flexible — we extract the common fields defensively.
 */
function parseQuote(
  raw: Record<string, unknown>,
  amountIn: number,
  currency: string
): OfframpQuoteResult {
  // The rates API returns an array of provider objects
  const rawProviders: Record<string, unknown>[] = Array.isArray(raw.providers)
    ? (raw.providers as Record<string, unknown>[])
    : Array.isArray(raw.rates)
    ? (raw.rates as Record<string, unknown>[])
    : [];

  const providers: QuoteProvider[] = rawProviders.map((p) => ({
    name: String(p.provider ?? p.name ?? "Unknown"),
    rate: Number(p.rate ?? p.exchangeRate ?? 0),
    fee: Number(p.fee ?? p.totalFee ?? 0),
    youReceive: Number(p.youReceive ?? p.amountLocal ?? p.destinationAmount ?? 0),
    estimatedTime: p.estimatedTime ? String(p.estimatedTime) : undefined,
    isBest: false,
  }));

  // Sort descending by youReceive (best deal first)
  providers.sort((a, b) => b.youReceive - a.youReceive);
  if (providers.length > 0) providers[0].isBest = true;

  const best = providers[0] ?? {
    name: "N/A",
    rate: Number(raw.rate ?? raw.exchangeRate ?? 0),
    fee: Number(raw.fee ?? raw.totalFee ?? 0),
    youReceive: Number(raw.youReceive ?? raw.amountLocal ?? 0),
    isBest: true,
  };

  // Slippage: difference between best and worst provider (or 0 if only one)
  const worst = providers[providers.length - 1];
  const slippagePercent =
    providers.length > 1 && best.youReceive > 0
      ? Math.abs(((best.youReceive - worst.youReceive) / best.youReceive) * 100)
      : 0;

  const expiresAt = new Date(Date.now() + QUOTE_TTL_SECONDS * 1_000).toISOString();

  return {
    amountIn,
    currency,
    rate: best.rate,
    totalFee: best.fee,
    youReceive: best.youReceive,
    slippagePercent: Math.round(slippagePercent * 100) / 100,
    providers,
    bestProvider: best.name,
    expiresAt,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOfframpQuote({
  token,
  amount,
  country,
  currency,
  debounceMs = 500,
  disabled = false,
}: OfframpQuoteParams): UseOfframpQuoteReturn {
  const [quote, setQuote] = useState<OfframpQuoteResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresInSeconds, setExpiresInSeconds] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFetchedOnce = useRef(false);

  const fetchQuote = useCallback(
    async (signal: AbortSignal) => {
      const numAmount = parseFloat(amount);
      if (!numAmount || numAmount <= 0) {
        setError("Enter a valid amount");
        setIsLoading(false);
        setIsInitialLoading(false);
        return;
      }

      try {
        const result = await offrampService.getAggregatedRates(
          { token, amount: numAmount, country, currency },
          signal
        );

        if (signal.aborted) return;

        if (!result.success) {
          setError(result.error ?? "Failed to fetch quote");
          setQuote(null);
        } else {
          const parsed = parseQuote(
            (result.data as Record<string, unknown>) ?? {},
            numAmount,
            currency
          );
          setQuote(parsed);
          setError(null);
          hasFetchedOnce.current = true;
          setExpiresInSeconds(QUOTE_TTL_SECONDS);
        }
      } catch (err) {
        if (signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to fetch quote");
        setQuote(null);
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
          setIsInitialLoading(false);
        }
      }
    },
    [token, amount, country, currency]
  );

  // Debounced effect: re-run whenever inputs change
  useEffect(() => {
    if (disabled || !token || !amount || !country || !currency) {
      setIsLoading(false);
      return;
    }

    // Cancel previous debounce and in-flight request
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    setIsLoading(true);
    if (!hasFetchedOnce.current) setIsInitialLoading(true);

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      fetchQuote(controller.signal);
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [token, amount, country, currency, debounceMs, disabled, fetchQuote]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Countdown timer until quote expires
  useEffect(() => {
    if (!quote) {
      setExpiresInSeconds(null);
      return;
    }
    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.round((new Date(quote.expiresAt).getTime() - Date.now()) / 1_000)
      );
      setExpiresInSeconds(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1_000);
    return () => clearInterval(interval);
  }, [quote]);

  const refresh = useCallback(() => {
    if (disabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    fetchQuote(controller.signal);
  }, [disabled, fetchQuote]);

  return {
    quote,
    isLoading,
    isInitialLoading,
    isRefreshing: isLoading && hasFetchedOnce.current,
    error,
    refresh,
    expiresInSeconds,
  };
}
