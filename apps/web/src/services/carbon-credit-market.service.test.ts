import { describe, expect, it } from "vitest";
import { CarbonCreditMarketService, CarbonMarketError } from "./carbon-credit-market.service";

const SELLER = "GD6BXVRVMEPHHXNZYVCI6HIJIB4OOGEFMVZ6OD2EWE37WCTMOVOCNJUW";
const BUYER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

function expectCode(fn: () => unknown, code: string) {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(CarbonMarketError);
  expect((thrown as CarbonMarketError).code).toBe(code);
}

function seeded() {
  const market = new CarbonCreditMarketService();
  market.issueCredits({ campaignId: "camp-1", holder: SELLER, quantity: 100, vintage: 2026 });
  return market;
}

describe("CarbonCreditMarketService", () => {
  it("issues credits per campaign", () => {
    const market = seeded();
    market.issueCredits({ campaignId: "camp-2", holder: SELLER, quantity: 5, vintage: 2025 });

    expect(market.getBalances(SELLER)).toEqual([
      { holder: SELLER, campaignId: "camp-1", available: 100, escrowed: 0 },
      { holder: SELLER, campaignId: "camp-2", available: 5, escrowed: 0 },
    ]);
    expect(market.getBalances(BUYER)).toEqual([]);
  });

  it("rejects fractional quantities and bad vintages", () => {
    const market = new CarbonCreditMarketService();
    expectCode(() => market.issueCredits({ campaignId: "c", holder: SELLER, quantity: 1.5, vintage: 2026 }), "INVALID_INPUT");
    expectCode(() => market.issueCredits({ campaignId: "c", holder: SELLER, quantity: 1, vintage: 26 }), "INVALID_INPUT");
  });

  it("escrows listed credits and refuses to over-list", () => {
    const market = seeded();
    const listing = market.createListing({
      seller: SELLER, campaignId: "camp-1", quantity: 60, pricePerCredit: "12.50", asset: "USDC",
    });

    expect(listing).toMatchObject({ status: "open", remaining: 60, pricePerCredit: "12.5", vintage: 2026 });
    expect(market.getBalances(SELLER)[0]).toMatchObject({ available: 40, escrowed: 60 });
    expectCode(
      () => market.createListing({ seller: SELLER, campaignId: "camp-1", quantity: 41, pricePerCredit: "1", asset: "USDC" }),
      "INSUFFICIENT_CREDITS",
    );
    expectCode(
      () => market.createListing({ seller: SELLER, campaignId: "camp-1", quantity: 1, pricePerCredit: "0", asset: "USDC" }),
      "INVALID_INPUT",
    );
  });

  it("fills listings partially then fully, with fees", () => {
    const market = seeded();
    const listing = market.createListing({
      seller: SELLER, campaignId: "camp-1", quantity: 10, pricePerCredit: "15", asset: "USDC",
    });

    const first = market.purchase(listing.id, BUYER, 4);
    expect(first).toMatchObject({ quantity: 4, grossAmount: "60", platformFee: "1.5", sellerProceeds: "58.5" });
    expect(market.getListing(listing.id)).toMatchObject({ status: "open", remaining: 6 });

    expectCode(() => market.purchase(listing.id, BUYER, 7), "INSUFFICIENT_LISTING_QUANTITY");
    market.purchase(listing.id, BUYER, 6);

    expect(market.getListing(listing.id)).toMatchObject({ status: "filled", remaining: 0 });
    expect(market.getBalances(SELLER)[0]).toMatchObject({ available: 90, escrowed: 0 });
    expect(market.getBalances(BUYER)).toEqual([
      { holder: BUYER, campaignId: "camp-1", available: 10, escrowed: 0 },
    ]);
    expectCode(() => market.purchase(listing.id, BUYER, 1), "LISTING_NOT_OPEN");
  });

  it("lets buyers resell what they bought", () => {
    const market = seeded();
    const listing = market.createListing({ seller: SELLER, campaignId: "camp-1", quantity: 5, pricePerCredit: "10", asset: "USDC" });
    market.purchase(listing.id, BUYER, 5);

    const resale = market.createListing({ seller: BUYER, campaignId: "camp-1", quantity: 5, pricePerCredit: "11", asset: "USDC" });
    expect(resale.vintage).toBe(2026);
  });

  it("blocks self-trades", () => {
    const market = seeded();
    const listing = market.createListing({ seller: SELLER, campaignId: "camp-1", quantity: 5, pricePerCredit: "10", asset: "USDC" });
    expectCode(() => market.purchase(listing.id, SELLER, 1), "SELF_TRADE");
  });

  it("returns unsold credits on cancel, only for the seller", () => {
    const market = seeded();
    const listing = market.createListing({ seller: SELLER, campaignId: "camp-1", quantity: 20, pricePerCredit: "10", asset: "USDC" });
    market.purchase(listing.id, BUYER, 5);

    expectCode(() => market.cancelListing(listing.id, BUYER), "NOT_LISTING_OWNER");
    const cancelled = market.cancelListing(listing.id, SELLER);

    expect(cancelled).toMatchObject({ status: "cancelled", remaining: 0 });
    expect(market.getBalances(SELLER)[0]).toMatchObject({ available: 95, escrowed: 0 });
    expectCode(() => market.cancelListing(listing.id, SELLER), "LISTING_NOT_OPEN");
  });

  it("sorts the order book cheapest first and filters trades by participant", () => {
    const market = seeded();
    const pricey = market.createListing({ seller: SELLER, campaignId: "camp-1", quantity: 5, pricePerCredit: "20", asset: "USDC" });
    const cheap = market.createListing({ seller: SELLER, campaignId: "camp-1", quantity: 5, pricePerCredit: "9.9999999", asset: "USDC" });

    expect(market.listListings({ status: "open" }).map((l) => l.id)).toEqual([cheap.id, pricey.id]);

    market.purchase(cheap.id, BUYER, 1);
    market.purchase(pricey.id, BUYER, 1);
    expect(market.listTrades({ address: BUYER }).map((t) => t.listingId)).toEqual([pricey.id, cheap.id]);
    expect(market.listTrades({ campaignId: "other" })).toEqual([]);
  });
});
