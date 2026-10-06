/**
 * Campaign Carbon Credit Secondary Market — issue #960 (v1)
 *
 * Sponsors earn carbon credits (1 credit = 1 tonne CO2e) when a campaign's
 * impact is verified. This service lets them list those credits for sale and
 * lets other participants buy them.
 *
 * - Credits are tracked per (holder, campaign): credits from different
 *   campaigns are not fungible, so every listing and trade names its campaign.
 * - Listing a quantity moves it from the seller's available balance into
 *   escrow; cancelling a listing returns whatever has not sold.
 * - Purchases can partially fill a listing. Each trade records the gross
 *   price, the platform fee and the seller's proceeds.
 *
 * v1 keeps the order book and balances in memory and records settlement
 * amounts; moving the payment asset on-chain is left to the settlement layer.
 */

import { randomUUID } from "crypto";
import { applyBps, formatAmount, parseAmount } from "@/lib/decimal-amount";

/** Platform fee taken from each trade's gross price: 250 bps = 2.5%. */
export const PLATFORM_FEE_BPS = 250;

export interface CreditBalance {
  holder: string;
  campaignId: string;
  available: number;
  escrowed: number;
}

export type ListingStatus = "open" | "filled" | "cancelled";

export interface CreditListing {
  id: string;
  seller: string;
  campaignId: string;
  vintage: number;
  quantity: number;
  remaining: number;
  pricePerCredit: string;
  asset: string;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreditTrade {
  id: string;
  listingId: string;
  campaignId: string;
  seller: string;
  buyer: string;
  quantity: number;
  pricePerCredit: string;
  asset: string;
  grossAmount: string;
  platformFee: string;
  sellerProceeds: string;
  executedAt: string;
}

export interface IssueCreditsInput {
  campaignId: string;
  holder: string;
  quantity: number;
  vintage: number;
}

export interface CreateListingInput {
  seller: string;
  campaignId: string;
  quantity: number;
  pricePerCredit: string;
  asset: string;
}

export interface ListingFilter {
  campaignId?: string;
  seller?: string;
  status?: ListingStatus;
}

export type CarbonMarketErrorCode =
  | "INVALID_INPUT"
  | "INSUFFICIENT_CREDITS"
  | "LISTING_NOT_FOUND"
  | "LISTING_NOT_OPEN"
  | "NOT_LISTING_OWNER"
  | "SELF_TRADE"
  | "INSUFFICIENT_LISTING_QUANTITY";

export class CarbonMarketError extends Error {
  constructor(message: string, public readonly code: CarbonMarketErrorCode) {
    super(message);
    this.name = "CarbonMarketError";
  }
}

function assertQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new CarbonMarketError("quantity must be a positive whole number of credits", "INVALID_INPUT");
  }
}

interface Holding {
  available: number;
  escrowed: number;
  /** Most recent vintage issued for this holding; listings inherit it. */
  vintage: number;
}

export class CarbonCreditMarketService {
  private readonly holdings = new Map<string, Holding>();
  private readonly listings = new Map<string, CreditListing>();
  private readonly trades: CreditTrade[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Credits a holder with credits earned from a verified campaign. */
  issueCredits(input: IssueCreditsInput): CreditBalance {
    assertQuantity(input.quantity);
    if (!input.campaignId) throw new CarbonMarketError("campaignId is required", "INVALID_INPUT");
    if (!Number.isInteger(input.vintage) || input.vintage < 2000 || input.vintage > 2100) {
      throw new CarbonMarketError("vintage must be a calendar year", "INVALID_INPUT");
    }
    const holding = this.holding(input.holder, input.campaignId);
    holding.available += input.quantity;
    holding.vintage = Math.max(holding.vintage, input.vintage);
    return this.toBalance(input.holder, input.campaignId, holding);
  }

  getBalances(holder: string): CreditBalance[] {
    const prefix = `${holder}:`;
    return [...this.holdings.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, holding]) => this.toBalance(holder, key.slice(prefix.length), holding));
  }

  createListing(input: CreateListingInput): CreditListing {
    assertQuantity(input.quantity);
    let price: bigint;
    try {
      price = parseAmount(input.pricePerCredit);
    } catch {
      throw new CarbonMarketError("pricePerCredit must be a decimal amount", "INVALID_INPUT");
    }
    if (price <= 0n) throw new CarbonMarketError("pricePerCredit must be greater than zero", "INVALID_INPUT");

    const holding = this.holdings.get(this.key(input.seller, input.campaignId));
    if (!holding || holding.available < input.quantity) {
      throw new CarbonMarketError("Not enough available credits to list", "INSUFFICIENT_CREDITS");
    }

    holding.available -= input.quantity;
    holding.escrowed += input.quantity;

    const timestamp = this.now().toISOString();
    const listing: CreditListing = {
      id: randomUUID(),
      seller: input.seller,
      campaignId: input.campaignId,
      vintage: holding.vintage,
      quantity: input.quantity,
      remaining: input.quantity,
      pricePerCredit: formatAmount(price),
      asset: input.asset,
      status: "open",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.listings.set(listing.id, listing);
    return listing;
  }

  getListing(listingId: string): CreditListing {
    const listing = this.listings.get(listingId);
    if (!listing) throw new CarbonMarketError("Listing not found", "LISTING_NOT_FOUND");
    return listing;
  }

  /** Lists matching listings; open ones are sorted cheapest first. */
  listListings(filter: ListingFilter = {}): CreditListing[] {
    return [...this.listings.values()]
      .filter(
        (l) =>
          (!filter.campaignId || l.campaignId === filter.campaignId) &&
          (!filter.seller || l.seller === filter.seller) &&
          (!filter.status || l.status === filter.status),
      )
      .sort((a, b) => {
        const byPrice = parseAmount(a.pricePerCredit) - parseAmount(b.pricePerCredit);
        return byPrice === 0n ? a.createdAt.localeCompare(b.createdAt) : byPrice < 0n ? -1 : 1;
      });
  }

  cancelListing(listingId: string, seller: string): CreditListing {
    const listing = this.getListing(listingId);
    if (listing.seller !== seller) {
      throw new CarbonMarketError("Only the seller can cancel this listing", "NOT_LISTING_OWNER");
    }
    if (listing.status !== "open") {
      throw new CarbonMarketError("Listing is no longer open", "LISTING_NOT_OPEN");
    }
    const holding = this.holding(listing.seller, listing.campaignId);
    holding.escrowed -= listing.remaining;
    holding.available += listing.remaining;

    listing.remaining = 0;
    listing.status = "cancelled";
    listing.updatedAt = this.now().toISOString();
    return listing;
  }

  purchase(listingId: string, buyer: string, quantity: number): CreditTrade {
    assertQuantity(quantity);
    const listing = this.getListing(listingId);
    if (listing.status !== "open") {
      throw new CarbonMarketError("Listing is no longer open", "LISTING_NOT_OPEN");
    }
    if (listing.seller === buyer) {
      throw new CarbonMarketError("Sellers cannot buy their own listing", "SELF_TRADE");
    }
    if (quantity > listing.remaining) {
      throw new CarbonMarketError(
        `Only ${listing.remaining} credits remain on this listing`,
        "INSUFFICIENT_LISTING_QUANTITY",
      );
    }

    const gross = parseAmount(listing.pricePerCredit) * BigInt(quantity);
    const fee = applyBps(gross, PLATFORM_FEE_BPS);

    this.holding(listing.seller, listing.campaignId).escrowed -= quantity;
    const buyerHolding = this.holding(buyer, listing.campaignId);
    buyerHolding.available += quantity;
    buyerHolding.vintage = Math.max(buyerHolding.vintage, listing.vintage);

    const executedAt = this.now().toISOString();
    listing.remaining -= quantity;
    listing.updatedAt = executedAt;
    if (listing.remaining === 0) listing.status = "filled";

    const trade: CreditTrade = {
      id: randomUUID(),
      listingId: listing.id,
      campaignId: listing.campaignId,
      seller: listing.seller,
      buyer,
      quantity,
      pricePerCredit: listing.pricePerCredit,
      asset: listing.asset,
      grossAmount: formatAmount(gross),
      platformFee: formatAmount(fee),
      sellerProceeds: formatAmount(gross - fee),
      executedAt,
    };
    this.trades.push(trade);
    return trade;
  }

  /** Trade history, newest first, optionally for one campaign or participant. */
  listTrades(filter: { campaignId?: string; address?: string } = {}): CreditTrade[] {
    return this.trades
      .filter(
        (t) =>
          (!filter.campaignId || t.campaignId === filter.campaignId) &&
          (!filter.address || t.buyer === filter.address || t.seller === filter.address),
      )
      .reverse();
  }

  private key(holder: string, campaignId: string): string {
    return `${holder}:${campaignId}`;
  }

  private holding(holder: string, campaignId: string): Holding {
    const key = this.key(holder, campaignId);
    let holding = this.holdings.get(key);
    if (!holding) {
      holding = { available: 0, escrowed: 0, vintage: 0 };
      this.holdings.set(key, holding);
    }
    return holding;
  }

  private toBalance(holder: string, campaignId: string, holding: Holding): CreditBalance {
    return { holder, campaignId, available: holding.available, escrowed: holding.escrowed };
  }
}

let instance: CarbonCreditMarketService | null = null;

export function getCarbonCreditMarketService(): CarbonCreditMarketService {
  instance ??= new CarbonCreditMarketService();
  return instance;
}
