import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceiptVerification } from "@/lib/sponsorship-receipt";

/**
 * Only the Horizon read is stubbed: issuing a receipt runs for real, so these
 * tests cover the actual commitment the endpoint returns.
 */
const verifyMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/campaign-sponsorship-receipt.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/campaign-sponsorship-receipt.service")>()),
  verifyCampaignSponsorshipReceipt: verifyMock,
}));

import { POST, PUT } from "./route";
import {
  SponsorshipReceiptError,
  buildSponsorshipReceipt,
  type SponsorshipReceiptInput,
} from "@/lib/sponsorship-receipt";

const CAMPAIGN = "camp-101";
const OTHER_CAMPAIGN = "camp-202";
const SPONSOR = "GD6BXVRVMEPHHXNZYVCI6HIJIB4OOGEFMVZ6OD2EWE37WCTMOVOCNJUW";
const TRANSACTION_HASH = "a".repeat(64);

const params = { params: Promise.resolve({ id: CAMPAIGN }) };
const request = (url: string, init?: RequestInit) => new Request(url, init);
const json = <T>(response: Response) => response.json() as Promise<T>;
const url = `http://test/api/campaigns/${CAMPAIGN}/sponsorship-receipt`;

function input(overrides: Partial<SponsorshipReceiptInput> = {}): SponsorshipReceiptInput {
  return {
    campaignId: CAMPAIGN,
    sponsorAddress: SPONSOR,
    treeCount: 100,
    speciesId: "oak",
    plantingLocation: { country: "Kenya", region: "Nyeri", latitude: -0.42, longitude: 36.95 },
    plantedAt: "2026-06-15",
    currency: "XLM",
    amount: "250",
    ...overrides,
  };
}

function verification(overrides: Partial<ReceiptVerification> = {}): ReceiptVerification {
  return {
    verified: true,
    status: "verified",
    receiptId: "rcpt_0123456789abcdef",
    receiptHash: "c".repeat(64),
    transactionHash: TRANSACTION_HASH,
    checks: {
      transactionFound: true,
      receiptHashMatchesContent: true,
      transactionSuccessful: true,
      memoTypeSupported: true,
      memoMatchesReceipt: true,
    },
    reason: null,
    transaction: null,
    ...overrides,
  };
}

beforeEach(() => {
  verifyMock.mockReset();
});

describe("POST /api/campaigns/:id/sponsorship-receipt", () => {
  it("issues a receipt with the memo the sponsor's payment must carry", async () => {
    const response = await POST(
      request(url, { method: "POST", body: JSON.stringify(input()) }) as never,
      params as never,
    );
    const body = await json<{
      success: boolean;
      receipt: { campaignId: string; treeCount: number; co2: { perYearKg: number }; receiptHash: string; receiptId: string };
      memo: { type: string; memoHex: string; byteLength: number };
      verification: { method: string; endpoint: string };
    }>(response);

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.receipt.campaignId).toBe(CAMPAIGN);
    expect(body.receipt.treeCount).toBe(100);
    expect(body.receipt.co2.perYearKg).toBe(4200);
    expect(body.receipt.receiptId).toBe(`rcpt_${body.receipt.receiptHash.slice(0, 16)}`);
    expect(body.memo).toEqual({
      type: "hash",
      memoHex: body.receipt.receiptHash,
      byteLength: 32,
    });
    expect(body.verification.endpoint).toBe(`/api/campaigns/${CAMPAIGN}/sponsorship-receipt`);
  });

  it("takes the campaign from the URL when the body repeats it", async () => {
    const response = await POST(
      request(url, { method: "POST", body: JSON.stringify(input({ campaignId: CAMPAIGN })) }) as never,
      params as never,
    );
    const body = await json<{ receipt: { campaignId: string } }>(response);

    expect(response.status).toBe(201);
    expect(body.receipt.campaignId).toBe(CAMPAIGN);
  });

  it("refuses a body that names a different campaign", async () => {
    const response = await POST(
      request(url, { method: "POST", body: JSON.stringify(input({ campaignId: OTHER_CAMPAIGN })) }) as never,
      params as never,
    );
    const body = await json<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(body.error).toContain("must match the campaign in the URL");
  });

  it.each([
    ["an unsupported species", { speciesId: "baobab" }, /supported species/],
    ["no trees at all", { treeCount: 0 }, /greater than 0/],
    ["an impossible planting date", { plantedAt: "2026-02-30" }, /real calendar date/],
    ["a non-Stellar sponsor", { sponsorAddress: "nope" }, /Stellar public key/],
  ])("rejects %s", async (_label, overrides, message) => {
    const response = await POST(
      request(url, { method: "POST", body: JSON.stringify(input(overrides as Partial<SponsorshipReceiptInput>)) }) as never,
      params as never,
    );

    const body = await json<{ success: boolean; error: string }>(response);

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(message);
  });

  it("rejects a body that is not a JSON object", async () => {
    const broken = await POST(
      request(url, { method: "POST", body: "not json" }) as never,
      params as never,
    );
    const array = await POST(
      request(url, { method: "POST", body: JSON.stringify([input()]) }) as never,
      params as never,
    );

    expect(broken.status).toBe(400);
    expect(array.status).toBe(400);
    await expect(json<{ error: string }>(array)).resolves.toMatchObject({
      error: "A JSON object body is required",
    });
  });
});

describe("PUT /api/campaigns/:id/sponsorship-receipt", () => {
  it("reports a verified receipt", async () => {
    const receipt = buildSponsorshipReceipt(input());
    verifyMock.mockResolvedValue(verification({ receiptHash: receipt.receiptHash }));

    const response = await PUT(
      request(url, {
        method: "PUT",
        body: JSON.stringify({ receipt, transactionHash: TRANSACTION_HASH }),
      }) as never,
      params as never,
    );
    const body = await json<{ success: boolean; campaignId: string; verified: boolean; status: string }>(
      response,
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, campaignId: CAMPAIGN, verified: true, status: "verified" });
    expect(verifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ receiptHash: receipt.receiptHash, treeCount: 100 }),
      TRANSACTION_HASH,
    );
  });

  it("accepts a receipt scanned from a QR code as a JSON string", async () => {
    const receipt = buildSponsorshipReceipt(input());
    verifyMock.mockResolvedValue(verification());

    const response = await PUT(
      request(url, {
        method: "PUT",
        body: JSON.stringify({ receipt: JSON.stringify(receipt), transactionHash: TRANSACTION_HASH }),
      }) as never,
      params as never,
    );

    expect(response.status).toBe(200);
    expect(verifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ receiptId: receipt.receiptId }),
      TRANSACTION_HASH,
    );
  });

  it("reports a receipt that does not match the ledger as a 200, not an error", async () => {
    const receipt = buildSponsorshipReceipt(input());
    verifyMock.mockResolvedValue(
      verification({
        verified: false,
        status: "not_found",
        reason: "No Stellar transaction with that hash was found.",
        checks: {
          transactionFound: false,
          receiptHashMatchesContent: true,
          transactionSuccessful: false,
          memoTypeSupported: false,
          memoMatchesReceipt: false,
        },
      }),
    );

    const response = await PUT(
      request(url, {
        method: "PUT",
        body: JSON.stringify({ receipt, transactionHash: TRANSACTION_HASH }),
      }) as never,
      params as never,
    );
    const body = await json<{ verified: boolean; status: string; reason: string }>(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ verified: false, status: "not_found" });
  });

  it("rejects a receipt for another campaign", async () => {
    const receipt = buildSponsorshipReceipt(input({ campaignId: OTHER_CAMPAIGN }));

    const response = await PUT(
      request(url, {
        method: "PUT",
        body: JSON.stringify({ receipt, transactionHash: TRANSACTION_HASH }),
      }) as never,
      params as never,
    );

    expect(response.status).toBe(400);
    await expect(json<{ error: string }>(response)).resolves.toMatchObject({
      error: "receipt does not belong to this campaign",
    });
    expect(verifyMock).not.toHaveBeenCalled();
  });
  it.each([
    ["a receipt", { transactionHash: TRANSACTION_HASH }, "receipt is required"],
    ["a transaction hash", { receipt: {} }, "transactionHash is required"],
  ])("requires %s", async (_label, payload, message) => {
    const response = await PUT(
      request(url, { method: "PUT", body: JSON.stringify(payload) }) as never,
      params as never,
    );
    const body = await json<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(body.error).toContain(message);
  });

  it("rejects a receipt the verifier cannot parse", async () => {
    const response = await PUT(
      request(url, {
        method: "PUT",
        body: JSON.stringify({ receipt: { version: 2 }, transactionHash: TRANSACTION_HASH }),
      }) as never,
      params as never,
    );

    const body = await json<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(body.error).toContain("Unsupported receipt version");
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("maps a rejected verification payload to a 400", async () => {
    const receipt = buildSponsorshipReceipt(input());
    // What the real verifier throws for a transaction hash that is not a hash.
    verifyMock.mockRejectedValue(
      new SponsorshipReceiptError("transactionHash must be a 64-character hex hash"),
    );

    const response = await PUT(
      request(url, { method: "PUT", body: JSON.stringify({ receipt, transactionHash: "nope" }) }) as never,
      params as never,
    );
    const body = await json<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe("transactionHash must be a 64-character hex hash");
    expect(verifyMock).toHaveBeenCalled();
  });

  it("fails the request when the ledger lookup itself fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const receipt = buildSponsorshipReceipt(input());
    verifyMock.mockRejectedValue(new Error(`Horizon is down for ${SPONSOR}`));

    const response = await PUT(
      request(url, {
        method: "PUT",
        body: JSON.stringify({ receipt, transactionHash: TRANSACTION_HASH }),
      }) as never,
      params as never,
    );

    expect(response.status).toBe(502);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
