"use client";

/**
 * OfframpSwapWidget — Dynamic offramp quote and liquidity swap widget (issue #529)
 *
 * Interactive card that lets users estimate offramp conversion rates in real time.
 * The widget debounces input, fetches live quotes from the offramp service, and
 * displays the conversion preview with:
 *   - You pay / You receive amount fields
 *   - Live exchange rate and best provider
 *   - Slippage indicator (green/amber/red by severity)
 *   - Fee breakdown
 *   - Quote expiry countdown
 *   - All available provider comparison
 *
 * Accessibility:
 *   - All form inputs have associated labels
 *   - Live region (aria-live="polite") for quote updates
 *   - Loading state announced to screen readers
 *   - Error messages use role="alert"
 */

import React, { useState, useId } from "react";
import {
  AlertCircle,
  ArrowDown,
  ChevronDown,
  Loader2,
  RefreshCw,
  TrendingDown,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useOfframpQuote } from "@/hooks/use-offramp-quote";
import type { QuoteProvider } from "@/hooks/use-offramp-quote";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPPORTED_TOKENS = ["USDC", "USDT", "EURC"] as const;
type SupportedToken = typeof SUPPORTED_TOKENS[number];

const SUPPORTED_CORRIDORS: { country: string; currency: string; label: string }[] = [
  { country: "NG", currency: "NGN", label: "Nigeria (NGN)" },
  { country: "GH", currency: "GHS", label: "Ghana (GHS)" },
  { country: "KE", currency: "KES", label: "Kenya (KES)" },
  { country: "ZA", currency: "ZAR", label: "South Africa (ZAR)" },
  { country: "TZ", currency: "TZS", label: "Tanzania (TZS)" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OfframpSwapWidgetProps {
  /** Initial token selection. Default: "USDC" */
  defaultToken?: SupportedToken;
  /** Initial amount. Default: "" */
  defaultAmount?: string;
  /** Initial country. Default: "NG" */
  defaultCountry?: string;
  /** Called when the user clicks "Proceed to offramp" */
  onProceed?: (params: {
    token: string;
    amount: string;
    country: string;
    currency: string;
    quote: import("@/hooks/use-offramp-quote").OfframpQuoteResult;
  }) => void;
  className?: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SlippageBadge({ percent }: { percent: number }) {
  const severity =
    percent <= 0.5 ? "low" : percent <= 2 ? "medium" : "high";
  const config = {
    low:    { label: "Low slippage",    cls: "bg-emerald-900/50 text-emerald-300 border-emerald-700/50" },
    medium: { label: "Moderate slippage", cls: "bg-amber-900/50 text-amber-300 border-amber-700/50" },
    high:   { label: "High slippage",   cls: "bg-red-900/50 text-red-300 border-red-700/50" },
  }[severity];

  return (
    <span
      aria-label={`${config.label}: ${percent.toFixed(2)}%`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        config.cls
      )}
    >
      <TrendingDown aria-hidden="true" className="h-3 w-3" />
      {percent.toFixed(2)}% slippage
    </span>
  );
}

function ProviderRow({ provider }: { provider: QuoteProvider }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
        provider.isBest
          ? "border border-fundable-purple-2/30 bg-fundable-purple-2/10"
          : "border border-white/5 bg-white/5"
      )}
    >
      <div className="flex items-center gap-2">
        {provider.isBest && (
          <Zap aria-hidden="true" className="h-3.5 w-3.5 text-fundable-purple-2" />
        )}
        <span className={cn("font-medium", provider.isBest ? "text-white" : "text-white/70")}>
          {provider.name}
        </span>
        {provider.isBest && (
          <span className="rounded-full bg-fundable-purple-2/20 px-1.5 py-0.5 text-xs text-fundable-purple-2">
            Best rate
          </span>
        )}
      </div>
      <div className="text-right">
        <p className={cn("font-semibold", provider.isBest ? "text-white" : "text-white/70")}>
          {provider.youReceive.toLocaleString()}
        </p>
        <p className="text-xs text-white/40">Fee: {provider.fee.toLocaleString()}</p>
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function OfframpSwapWidget({
  defaultToken = "USDC",
  defaultAmount = "",
  defaultCountry = "NG",
  onProceed,
  className,
}: OfframpSwapWidgetProps) {
  const id = useId();
  const [token, setToken] = useState<SupportedToken>(defaultToken);
  const [amount, setAmount] = useState(defaultAmount);
  const [country, setCountry] = useState(defaultCountry);
  const [showProviders, setShowProviders] = useState(false);

  const corridor = SUPPORTED_CORRIDORS.find((c) => c.country === country)
    ?? SUPPORTED_CORRIDORS[0];

  const { quote, isLoading, isInitialLoading, isRefreshing, error, refresh, expiresInSeconds } =
    useOfframpQuote({
      token,
      amount,
      country: corridor.country,
      currency: corridor.currency,
      disabled: !amount || parseFloat(amount) <= 0,
    });

  const amountNum = parseFloat(amount) || 0;
  const hasValidInput = amountNum > 0;

  const handleProceed = () => {
    if (!quote || !hasValidInput) return;
    onProceed?.({ token, amount, country: corridor.country, currency: corridor.currency, quote });
  };

  return (
    <section
      aria-label="Offramp quote widget"
      data-testid="offramp-swap-widget"
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-white/10",
        "bg-fundable-dark/90 p-5 shadow-xl backdrop-blur-sm",
        "w-full max-w-md",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white">Offramp Quote</h2>
        <button
          type="button"
          onClick={refresh}
          disabled={!hasValidInput || isLoading}
          aria-label="Refresh quote"
          className={cn(
            "rounded-md p-1.5 text-white/40 transition-colors",
            "hover:bg-white/10 hover:text-white",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fundable-purple-2",
            "disabled:cursor-not-allowed disabled:opacity-30"
          )}
        >
          <RefreshCw
            aria-hidden="true"
            className={cn("h-4 w-4", isRefreshing && "animate-spin")}
          />
        </button>
      </div>

      {/* You Pay */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-amount`} className="text-xs font-medium text-white/60">
          You pay
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              id={`${id}-amount`}
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              aria-describedby={error ? `${id}-error` : undefined}
              aria-invalid={!!error}
              className={cn(
                "w-full rounded-xl border bg-white/5 px-4 py-3 text-lg font-semibold text-white",
                "placeholder:text-white/20 focus:outline-none focus:ring-2",
                "transition-colors",
                error
                  ? "border-red-500/50 focus:ring-red-500/30"
                  : "border-white/10 focus:ring-fundable-purple-2/50 focus:border-fundable-purple-2/50"
              )}
            />
          </div>

          {/* Token selector */}
          <div className="relative">
            <label htmlFor={`${id}-token`} className="sr-only">
              Select token
            </label>
            <select
              id={`${id}-token`}
              value={token}
              onChange={(e) => setToken(e.target.value as SupportedToken)}
              className={cn(
                "h-full appearance-none rounded-xl border border-white/10 bg-white/10",
                "px-3 pr-8 text-sm font-semibold text-white",
                "focus:outline-none focus:ring-2 focus:ring-fundable-purple-2/50",
                "cursor-pointer transition-colors hover:bg-white/15"
              )}
            >
              {SUPPORTED_TOKENS.map((t) => (
                <option key={t} value={t} className="bg-fundable-dark text-white">
                  {t}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
            />
          </div>
        </div>
      </div>

      {/* Swap arrow */}
      <div className="flex items-center justify-center">
        <div className="rounded-full border border-white/10 bg-white/5 p-2">
          <ArrowDown aria-hidden="true" className="h-4 w-4 text-white/40" />
        </div>
      </div>

      {/* You Receive */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-receive`} className="text-xs font-medium text-white/60">
          You receive (estimated)
        </label>
        <div className="flex gap-2">
          <div
            id={`${id}-receive`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-label={
              isInitialLoading
                ? "Fetching quote…"
                : quote
                ? `You will receive ${quote.youReceive.toLocaleString()} ${quote.currency}`
                : "Enter an amount to see a quote"
            }
            className={cn(
              "flex flex-1 items-center rounded-xl border border-white/10 bg-white/5 px-4 py-3",
              "min-h-[52px]"
            )}
          >
            {isInitialLoading ? (
              <div className="flex items-center gap-2 text-white/40">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                <span className="text-sm">Fetching quote…</span>
              </div>
            ) : quote ? (
              <div className="flex w-full items-center justify-between">
                <span className="text-lg font-semibold text-white">
                  {quote.youReceive.toLocaleString()}
                </span>
                {isRefreshing && (
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin text-white/40"
                  />
                )}
              </div>
            ) : (
              <span className="text-sm text-white/30">
                {hasValidInput ? "—" : "Enter an amount above"}
              </span>
            )}
          </div>

          {/* Currency / corridor selector */}
          <div className="relative">
            <label htmlFor={`${id}-corridor`} className="sr-only">
              Select country and currency
            </label>
            <select
              id={`${id}-corridor`}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={cn(
                "h-full appearance-none rounded-xl border border-white/10 bg-white/10",
                "px-3 pr-8 text-sm font-semibold text-white",
                "focus:outline-none focus:ring-2 focus:ring-fundable-purple-2/50",
                "cursor-pointer transition-colors hover:bg-white/15"
              )}
            >
              {SUPPORTED_CORRIDORS.map((c) => (
                <option key={c.country} value={c.country} className="bg-fundable-dark text-white">
                  {c.currency}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
            />
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div
          id={`${id}-error`}
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red-700/50 bg-red-950/30 px-3 py-2 text-sm text-red-400"
        >
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Quote details */}
      {quote && !isInitialLoading && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
          {/* Rate row */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Rate</span>
            <span className="font-medium text-white">
              1 {token} = {quote.rate.toLocaleString()} {quote.currency}
            </span>
          </div>

          {/* Fee row */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Fee</span>
            <span className="font-medium text-white">
              {quote.totalFee.toLocaleString()} {quote.currency}
            </span>
          </div>

          {/* Slippage */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Price impact</span>
            <SlippageBadge percent={quote.slippagePercent} />
          </div>

          {/* Best provider */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Best via</span>
            <span className="font-medium text-fundable-purple-2">{quote.bestProvider}</span>
          </div>

          {/* Quote expiry */}
          {expiresInSeconds !== null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">Quote expires in</span>
              <span
                className={cn(
                  "font-mono font-medium",
                  expiresInSeconds <= 10 ? "text-red-400" :
                  expiresInSeconds <= 20 ? "text-amber-400" :
                  "text-white/40"
                )}
              >
                {expiresInSeconds}s
              </span>
            </div>
          )}

          {/* Provider comparison toggle */}
          {quote.providers.length > 1 && (
            <button
              type="button"
              onClick={() => setShowProviders((p) => !p)}
              aria-expanded={showProviders}
              aria-controls={`${id}-providers`}
              className={cn(
                "flex items-center gap-1 text-xs text-white/40 hover:text-white/70",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fundable-purple-2",
                "transition-colors rounded-sm mt-1"
              )}
            >
              <ChevronDown
                aria-hidden="true"
                className={cn("h-3 w-3 transition-transform", showProviders && "rotate-180")}
              />
              {showProviders ? "Hide" : "Compare"} {quote.providers.length} providers
            </button>
          )}

          {/* Provider list */}
          {showProviders && (
            <div
              id={`${id}-providers`}
              className="mt-1 flex flex-col gap-1.5"
              aria-label="Provider comparison"
            >
              {quote.providers.map((provider) => (
                <ProviderRow key={provider.name} provider={provider} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Corridor label */}
      <p className="text-center text-xs text-white/30">
        Converting to {corridor.label}
      </p>

      {/* CTA */}
      <Button
        variant="gradient"
        size="lg"
        onClick={handleProceed}
        disabled={!quote || !hasValidInput || isLoading}
        aria-label={
          !hasValidInput
            ? "Enter an amount to proceed"
            : isLoading
            ? "Fetching quote…"
            : `Proceed to offramp — receive ${quote?.youReceive.toLocaleString()} ${quote?.currency}`
        }
        className="w-full"
      >
        {isLoading && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
        {isLoading ? "Fetching quote…" : "Proceed to offramp"}
      </Button>
    </section>
  );
}

export default OfframpSwapWidget;
