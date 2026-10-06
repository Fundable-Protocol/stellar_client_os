import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getBalances, POST as issueCredits } from "./balances/route";
import { GET as getListings, POST as createListing } from "./listings/route";
import { POST as purchase } from "./listings/[listingId]/purchase/route";

const SELLER = "GD6BXVRVMEPHHXNZYVCI6HIJIB4OOGEFMVZ6OD2EWE37WCTMOVOCNJUW";
const BUYER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const TOKEN = "test-issuer-token";
const BASE = "http://test/api/carbon-credits";

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("carbon credit market API", () => {
  beforeEach(() => {
    process.env.CARBON_MARKET_ADMIN_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.CARBON_MARKET_ADMIN_TOKEN;
  });

  it("only lets the impact oracle issue credits", async () => {
    const body = { campaignId: "route-camp", holder: SELLER, quantity: 10, vintage: 2026 };
    expect((await issueCredits(post(`${BASE}/balances`, body))).status).toBe(401);
    expect(
      (await issueCredits(post(`${BASE}/balances`, body, { authorization: "Bearer wrong-token-value" }))).status,
    ).toBe(401);
    expect(
      (await issueCredits(post(`${BASE}/balances`, body, { authorization: `Bearer ${TOKEN}` }))).status,
    ).toBe(201);
  });

  it("lists credits and sells them to another participant", async () => {
    await issueCredits(
      post(
        `${BASE}/balances`,
        { campaignId: "route-camp-2", holder: SELLER, quantity: 10, vintage: 2026 },
        { authorization: `Bearer ${TOKEN}` },
      ),
    );

    const created = await createListing(
      post(`${BASE}/listings`, { seller: SELLER, campaignId: "route-camp-2", quantity: 10, pricePerCredit: "8" }),
    );
    expect(created.status).toBe(201);
    const { data: listing } = await created.json();
    expect(listing.asset).toBe("USDC");

    const book = await getListings(new Request(`${BASE}/listings?campaignId=route-camp-2`));
    expect((await book.json()).data.map((l: { id: string }) => l.id)).toEqual([listing.id]);

    const traded = await purchase(post(`${BASE}/listings/${listing.id}/purchase`, { buyer: BUYER, quantity: 3 }), {
      params: Promise.resolve({ listingId: listing.id }),
    });
    expect(traded.status).toBe(201);
    expect((await traded.json()).data).toMatchObject({ grossAmount: "24", platformFee: "0.6", sellerProceeds: "23.4" });

    const balances = await getBalances(new Request(`${BASE}/balances?address=${BUYER}`));
    expect((await balances.json()).data).toContainEqual({
      holder: BUYER, campaignId: "route-camp-2", available: 3, escrowed: 0,
    });
  });

  it("validates payloads and maps domain errors", async () => {
    const bad = await createListing(
      post(`${BASE}/listings`, { seller: "not-an-address", campaignId: "x", quantity: 1, pricePerCredit: "1" }),
    );
    expect(bad.status).toBe(400);

    const unfunded = await createListing(
      post(`${BASE}/listings`, { seller: BUYER, campaignId: "never-issued", quantity: 1, pricePerCredit: "1" }),
    );
    expect(unfunded.status).toBe(409);
    expect((await unfunded.json()).code).toBe("INSUFFICIENT_CREDITS");

    const missing = await purchase(post(`${BASE}/listings/nope/purchase`, { buyer: BUYER, quantity: 1 }), {
      params: Promise.resolve({ listingId: "nope" }),
    });
    expect(missing.status).toBe(404);

    expect((await getListings(new Request(`${BASE}/listings?status=bogus`))).status).toBe(400);
  });
});
