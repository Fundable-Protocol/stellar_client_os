"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Loader2, RefreshCw, Tag, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

export interface CarbonCreditListing {
  id: string;
  campaignId: string;
  sellerId: string;
  amount: string;
  pricePerCredit: string;
  currency: string;
  status: "open" | "filled" | "cancelled";
  createdAt: number;
  updatedAt: number;
}

export interface CarbonCreditTrade {
  id: string;
  listingId: string;
  campaignId: string;
  buyerId: string;
  sellerId: string;
  amount: string;
  pricePerCredit: string;
  totalPrice: string;
  currency: string;
  createdAt: number;
}

export interface CarbonCreditBalance {
  campaignId: string;
  ownerId: string;
  available: string;
  locked: string;
}

export interface CarbonCreditMarketplaceProps {
  campaignId: string;
  currentUserId: string;
  /** Optional initial data to avoid a first render flash. */
  initialListings?: CarbonCreditListing[];
  initialBalance?: CarbonCreditBalance | null;
  initialTrades?: CarbonCreditTrade[];
  /** Override the API base path (defaults to the campaign credits endpoint). */
  apiBasePath?: string;
  className?: string;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: string;
}

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

function isPositiveDecimal(value: string): boolean {
  if (!DECIMAL_PATTERN.test(value)) return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function formatAmount(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatCurrency(value: string, currency: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 6,
    }).format(numeric);
  } catch {
    return `${formatAmount(value)} ${currency}`;
  }
}

async function readEnvelope<T>(response: Response): Promise<T> {
  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }
  if (!payload || payload.data === undefined) {
    throw new Error("Malformed response from carbon credit marketplace");
  }
  return payload.data;
}

/**
 * Secondary market for trading carbon credits earned from campaigns.
 *
 * Sponsors who earned credits can list them for sale, and other participants
 * can buy them. The component talks to the campaign credits API and keeps the
 * listing book, the caller's balance, and their trade history in sync.
 */
export function CarbonCreditMarketplace({
  campaignId,
  currentUserId,
  initialListings,
  initialBalance,
  initialTrades,
  apiBasePath,
  className,
}: CarbonCreditMarketplaceProps) {
  const { toast } = useToast();
  const basePath = apiBasePath ?? `/api/campaigns/${encodeURIComponent(campaignId)}/credits`;

  const [listings, setListings] = useState<CarbonCreditListing[]>(initialListings ?? []);
  const [balance, setBalance] = useState<CarbonCreditBalance | null>(initialBalance ?? null);
  const [trades, setTrades] = useState<CarbonCreditTrade[]>(initialTrades ?? []);
  const [loading, setLoading] = useState(!initialListings);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sellAmount, setSellAmount] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellCurrency, setSellCurrency] = useState("USD");
  const [submittingListing, setSubmittingListing] = useState(false);

  const [buyAmounts, setBuyAmounts] = useState<Record<string, string>>({});
  const [buyingListingId, setBuyingListingId] = useState<string | null>(null);

  const loadMarketplace = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const [listingsResponse, balanceResponse, tradesResponse] = await Promise.all([
          fetch(`${basePath}/listings`, { cache: "no-store" }),
          fetch(`${basePath}/balance`, { cache: "no-store" }),
          fetch(`${basePath}/trades`, { cache: "no-store" }),
        ]);
        const [nextListings, nextBalance, nextTrades] = await Promise.all([
          readEnvelope<CarbonCreditListing[]>(listingsResponse),
          readEnvelope<CarbonCreditBalance>(balanceResponse),
          readEnvelope<CarbonCreditTrade[]>(tradesResponse),
        ]);
        setListings(nextListings);
        setBalance(nextBalance);
        setTrades(nextTrades);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Failed to load carbon credit market";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [basePath],
  );

  useEffect(() => {
    void loadMarketplace({ silent: Boolean(initialListings) });
  }, [loadMarketplace, initialListings]);

  const openListings = useMemo(
    () => listings.filter((listing) => listing.status === "open"),
    [listings],
  );

  const myListings = useMemo(
    () => listings.filter((listing) => listing.sellerId === currentUserId),
    [listings, currentUserId],
  );

  const availableBalance = balance?.available ?? "0";
  const lockedBalance = balance?.locked ?? "0";

  const handleCreateListing = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isPositiveDecimal(sellAmount)) {
        toast({ title: "Invalid amount", description: "Enter a positive credit amount to sell.", variant: "destructive" });
        return;
      }
      if (!isPositiveDecimal(sellPrice)) {
        toast({ title: "Invalid price", description: "Enter a positive price per credit.", variant: "destructive" });
        return;
      }
      if (Number(sellAmount) > Number(availableBalance)) {
        toast({
          title: "Insufficient credits",
          description: `You only have ${formatAmount(availableBalance)} credits available.`,
          variant: "destructive",
        });
        return;
      }
      setSubmittingListing(true);
      try {
        const response = await fetch(`${basePath}/listings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sellerId: currentUserId,
            amount: sellAmount,
            pricePerCredit: sellPrice,
            currency: sellCurrency,
          }),
        });
        const listing = await readEnvelope<CarbonCreditListing>(response);
        setListings((previous) => [listing, ...previous]);
        setSellAmount("");
        setSellPrice("");
        toast({ title: "Listing created", description: `Listed ${formatAmount(listing.amount)} credits for sale.` });
        await loadMarketplace({ silent: true });
      } catch (listingError) {
        const message = listingError instanceof Error ? listingError.message : "Failed to create listing";
        toast({ title: "Listing failed", description: message, variant: "destructive" });
      } finally {
        setSubmittingListing(false);
      }
    },
    [availableBalance, basePath, currentUserId, loadMarketplace, sellAmount, sellCurrency, sellPrice, toast],
  );

  const handleCancelListing = useCallback(
    async (listingId: string) => {
      try {
        const response = await fetch(`${basePath}/listings/${encodeURIComponent(listingId)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sellerId: currentUserId }),
        });
        const updated = await readEnvelope<CarbonCreditListing>(response);
        setListings((previous) => previous.map((listing) => (listing.id === updated.id ? updated : listing)));
        toast({ title: "Listing cancelled", description: "Your credits are available again." });
        await loadMarketplace({ silent: true });
      } catch (cancelError) {
        const message = cancelError instanceof Error ? cancelError.message : "Failed to cancel listing";
        toast({ title: "Cancel failed", description: message, variant: "destructive" });
      }
    },
    [basePath, currentUserId, loadMarketplace, toast],
  );

  const handleBuy = useCallback(
    async (listing: CarbonCreditListing) => {
      const requested = buyAmounts[listing.id] ?? listing.amount;
      if (!isPositiveDecimal(requested)) {
        toast({ title: "Invalid amount", description: "Enter a positive credit amount to buy.", variant: "destructive" });
        return;
      }
      if (Number(requested) > Number(listing.amount)) {
        toast({
          title: "Amount too high",
          description: `Only ${formatAmount(listing.amount)} credits are listed.`,
          variant: "destructive",
        });
        return;
      }
      setBuyingListingId(listing.id);
      try {
        const response = await fetch(`${basePath}/trades`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId: listing.id,
            buyerId: currentUserId,
            amount: requested,
          }),
        });
        const trade = await readEnvelope<CarbonCreditTrade>(response);
        setTrades((previous) => [trade, ...previous]);
        setBuyAmounts((previous) => {
          const next = { ...previous };
          delete next[listing.id];
          return next;
        });
        toast({
          title: "Trade complete",
          description: `Bought ${formatAmount(trade.amount)} credits for ${formatCurrency(trade.totalPrice, trade.currency)}.`,
        });
        await loadMarketplace({ silent: true });
      } catch (buyError) {
        const message = buyError instanceof Error ? buyError.message : "Failed to complete trade";
        toast({ title: "Trade failed", description: message, variant: "destructive" });
      } finally {
        setBuyingListingId(null);
      }
    },
    [basePath, buyAmounts, currentUserId, loadMarketplace, toast],
  );

  return (
    <section className={className} aria-label="Carbon credit secondary market">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-100">
            <ArrowLeftRight className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            Carbon credit market
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Trade credits earned from this campaign with other participants. Listings settle instantly and
            update your available balance.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadMarketplace({ silent: true })}
          disabled={refreshing || loading}
        >
          {refreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Refresh
        </Button>
      </header>

      {error ? (
        <p role="alert" className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                Open listings
              </CardTitle>
              <CardDescription>Buy credits from sponsors who earned them.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="flex items-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading listings…
                </p>
              ) : openListings.length === 0 ? (
                <p className="text-sm text-zinc-400">No open listings yet. Be the first to sell credits.</p>
              ) : (
                <ul className="space-y-4">
                  {openListings.map((listing) => {
                    const isOwn = listing.sellerId === currentUserId;
                    const requested = buyAmounts[listing.id] ?? listing.amount;
                    const total = isPositiveDecimal(requested)
                      ? (Number(requested) * Number(listing.pricePerCredit)).toString()
                      : "0";
                    return (
                      <li
                        key={listing.id}
                        className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-zinc-100">
                              {formatAmount(listing.amount)} credits @ {formatCurrency(listing.pricePerCredit, listing.currency)}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              Seller {listing.sellerId}
                              {isOwn ? " (you)" : ""}
                            </p>
                          </div>
                          <Badge variant={isOwn ? "secondary" : "default"}>{isOwn ? "Your listing" : "Open"}</Badge>
                        </div>

                        {isOwn ? (
                          <div className="mt-3">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => void handleCancelListing(listing.id)}
                            >
                              Cancel listing
                            </Button>
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-wrap items-end gap-3">
                            <div className="w-32">
                              <Label htmlFor={`buy-amount-${listing.id}`} className="text-xs text-zinc-400">
                                Amount
                              </Label>
                              <Input
                                id={`buy-amount-${listing.id}`}
                                inputMode="decimal"
                                value={requested}
                                onChange={(event) =>
                                  setBuyAmounts((previous) => ({ ...previous, [listing.id]: event.target.value }))
                                }
                              />
                            </div>
                            <p className="text-sm text-zinc-300">
                              Total: {formatCurrency(total, listing.currency)}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void handleBuy(listing)}
                              disabled={buyingListingId === listing.id}
                            >
                              {buyingListingId === listing.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : null}
                              Buy credits
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your trade history</CardTitle>
              <CardDescription>Credits you bought or sold on the secondary market.</CardDescription>
            </CardHeader>
            <CardContent>
              {trades.length === 0 ? (
                <p className="text-sm text-zinc-400">No trades yet.</p>
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {trades.map((trade) => {
                    const isBuyer = trade.buyerId === currentUserId;
                    return (
                      <li key={trade.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div>
                          <p className="text-sm text-zinc-100">
                            {isBuyer ? "Bought" : "Sold"} {formatAmount(trade.amount)} credits
                          </p>
                          <p className="text-xs text-zinc-500">
                            {formatCurrency(trade.totalPrice, trade.currency)} · {new Date(trade.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <Badge variant={isBuyer ? "default" : "secondary"}>{isBuyer ? "Buy" : "Sell"}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your balance</CardTitle>
              <CardDescription>Credits earned from this campaign.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Available</span>
                <span className="font-medium text-zinc-100">{formatAmount(availableBalance)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Listed</span>
                <span className="font-medium text-zinc-100">{formatAmount(lockedBalance)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Tag className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                Sell credits
              </CardTitle>
              <CardDescription>List earned credits for other participants to buy.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleCreateListing}>
                <div>
                  <Label htmlFor="sell-amount" className="text-xs text-zinc-400">
                    Amount
                  </Label>
                  <Input
                    id="sell-amount"
                    inputMode="decimal"
                    value={sellAmount}
                    onChange={(event) => setSellAmount(event.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label htmlFor="sell-price" className="text-xs text-zinc-400">
                    Price per credit
                  </Label>
                  <Input
                    id="sell-price"
                    inputMode="decimal"
                    value={sellPrice}
                    onChange={(event) => setSellPrice(event.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="sell-currency" className="text-xs text-zinc-400">
                    Currency
                  </Label>
                  <Select value={sellCurrency} onValueChange={setSellCurrency}>
                    <SelectTrigger id="sell-currency">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={submittingListing}>
                  {submittingListing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Create listing
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your listings</CardTitle>
              <CardDescription>Manage credits you have put up for sale.</CardDescription>
            </CardHeader>
            <CardContent>
              {myListings.length === 0 ? (
                <p className="text-sm text-zinc-400">You have no listings.</p>
              ) : (
                <ul className="space-y-3">
                  {myListings.map((listing) => (
                    <li key={listing.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-zinc-200">
                        {formatAmount(listing.amount)} @ {formatCurrency(listing.pricePerCredit, listing.currency)}
                      </span>
                      <Badge variant={listing.status === "open" ? "default" : "secondary"}>{listing.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

export default CarbonCreditMarketplace;