import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_HORIZON_URL,
  createHorizonTransactionFetcher,
  issueCampaignSponsorshipReceipt,
  verifyCampaignSponsorshipReceipt,
} from "./campaign-sponsorship-receipt.service";
import {
  SponsorshipReceiptError,
  buildSponsorshipReceipt,
  type ChainTransactionRecord,
  type SponsorshipReceiptInput,
} from "@/lib/sponsorship-receipt";

/** Horizon client, stubbed so the tests never touch the network. */
const horizon = vi.hoisted(() => ({
  call: vi.fn(),
  urls: [] as string[],
}));

vi.mock("@stellar/stellar-sdk", () => ({
  Horizon: {
    Server: class MockHorizonServer {
      constructor(url: string) {
        horizon.urls.push(url);
      }

      transactions() {
        return {
          transaction: (hash: string) => ({ call: () => horizon.call(hash) }),
        };
      }
    },
  },
}));

const SPONSOR = "GD6BXVRVMEPHHXNZYVCI6HIJIB4OOGEFMVZ6OD2EWE37WCTMOVOCNJUW";
const TRANSACTION_HASH = "a".repeat(64);

function input(overrides: Partial<SponsorshipReceiptInput> = {}): SponsorshipReceiptInput {
  return {
    campaignId: "camp-101",
    sponsorAddress: SPONSOR,
    treeCount: 100,
    speciesId: "oak",
    plantingLocation: { country: "Kenya", region: "Nyeri", latitude: -0.42, longitude: 36.95 },
    plantedAt: "2026-06-15",
    ...overrides,
  };
}

/** A Horizon transaction payload, as the SDK hands it back. */
function horizonRecord(receiptHash: string) {
  return {
    hash: TRANSACTION_HASH,
    successful: true,
    memo_type: "hash",
    memo: Buffer.from(receiptHash, "hex").toString("base64"),
    source_account: SPONSOR,
    // The SDK moves the scalar ledger aside as `ledger_attr` and replaces
    // `ledger` with a link follower, so only `ledger_attr` carries the number.
    ledger_attr: 1234567,
    created_at: "2026-06-16T00:00:00Z",
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  horizon.call.mockReset();
  horizon.urls.length = 0;
});

describe("issueCampaignSponsorshipReceipt", () => {
  it("returns the receipt, the memo the payment must carry, and how to verify it", () => {
    const issuance = issueCampaignSponsorshipReceipt(input());

    expect(issuance.receipt.campaignId).toBe("camp-101");
    expect(issuance.receipt.treeCount).toBe(100);
    expect(issuance.memo).toEqual({
      type: "hash",
      memoHex: issuance.receipt.receiptHash,
      byteLength: 32,
    });
    expect(issuance.verification).toMatchObject({
      method: "PUT",
      endpoint: "/api/campaigns/camp-101/sponsorship-receipt",
      acceptedMemoTypes: ["hash", "text"],
    });
  });

  it("rejects a sponsorship that cannot produce a verifiable receipt", () => {
    expect(() => issueCampaignSponsorshipReceipt(input({ treeCount: 0 }))).toThrow(
      SponsorshipReceiptError,
    );
  });
});

describe("verifyCampaignSponsorshipReceipt", () => {
  it("verifies against a transaction fetched from the injected fetcher", async () => {
    const receipt = buildSponsorshipReceipt(input());
    const fetchTransaction = vi.fn().mockResolvedValue({
      hash: TRANSACTION_HASH,
      successful: true,
      memoType: "hash",
      memo: Buffer.from(receipt.receiptHash, "hex").toString("base64"),
      sourceAccount: SPONSOR,
      ledger: 1234567,
      createdAt: "2026-06-16T00:00:00Z",
    } as ChainTransactionRecord);

    const result = await verifyCampaignSponsorshipReceipt(receipt, TRANSACTION_HASH, fetchTransaction);

    expect(fetchTransaction).toHaveBeenCalledWith(TRANSACTION_HASH);
    expect(result).toMatchObject({ verified: true, status: "verified", transactionHash: TRANSACTION_HASH });
  });

  it("reports a transaction that is not on the ledger", async () => {
    const receipt = buildSponsorshipReceipt(input());
    const result = await verifyCampaignSponsorshipReceipt(receipt, TRANSACTION_HASH, async () => null);

    expect(result.verified).toBe(false);
    expect(result.status).toBe("not_found");
  });

  it("rejects a malformed transaction hash before reaching Horizon", async () => {
    const receipt = buildSponsorshipReceipt(input());
    const fetchTransaction = vi.fn();

    await expect(
      verifyCampaignSponsorshipReceipt(receipt, "not-a-hash", fetchTransaction),
    ).rejects.toThrow(SponsorshipReceiptError);
    expect(fetchTransaction).not.toHaveBeenCalled();
  });

  it("propagates a lookup failure instead of reporting a missing transaction", async () => {
    const receipt = buildSponsorshipReceipt(input());
    const fetchTransaction = vi.fn().mockRejectedValue(new Error("Horizon is down"));

    await expect(
      verifyCampaignSponsorshipReceipt(receipt, TRANSACTION_HASH, fetchTransaction),
    ).rejects.toThrow("Horizon is down");
  });
});

describe("createHorizonTransactionFetcher", () => {
  it("reduces a Horizon transaction to the fields verification needs", async () => {
    const receipt = buildSponsorshipReceipt(input());
    horizon.call.mockResolvedValue(horizonRecord(receipt.receiptHash));

    const transaction = await createHorizonTransactionFetcher("https://horizon.example.org")(
      TRANSACTION_HASH,
    );

    expect(horizon.call).toHaveBeenCalledWith(TRANSACTION_HASH);
    expect(horizon.urls).toEqual(["https://horizon.example.org"]);
    expect(transaction).toEqual({
      hash: TRANSACTION_HASH,
      successful: true,
      memoType: "hash",
      memo: Buffer.from(receipt.receiptHash, "hex").toString("base64"),
      sourceAccount: SPONSOR,
      // Read from `ledger_attr`, not the SDK's `ledger` link follower.
      ledger: 1234567,
      createdAt: "2026-06-16T00:00:00Z",
    });
  });

  it("resolves null when Horizon does not know the hash", async () => {
    horizon.call.mockRejectedValue({ response: { status: 404, statusText: "Not Found" } });

    await expect(createHorizonTransactionFetcher("https://horizon.example.org")(TRANSACTION_HASH)).resolves.toBeNull();
  });

  it("rethrows a Horizon failure so it cannot be mistaken for a missing transaction", async () => {
    horizon.call.mockRejectedValue({ response: { status: 503 } });

    await expect(
      createHorizonTransactionFetcher("https://horizon.example.org")(TRANSACTION_HASH),
    ).rejects.toMatchObject({ response: { status: 503 } });
  });

  it("uses NEXT_PUBLIC_STELLAR_HORIZON_URL and falls back to the testnet default", () => {
    vi.stubEnv("NEXT_PUBLIC_STELLAR_HORIZON_URL", "https://horizon.custom.example.org");
    createHorizonTransactionFetcher();
    vi.stubEnv("NEXT_PUBLIC_STELLAR_HORIZON_URL", "");
    createHorizonTransactionFetcher();
    vi.unstubAllEnvs();

    expect(horizon.urls).toEqual([
      "https://horizon.custom.example.org",
      DEFAULT_HORIZON_URL,
    ]);
    expect(DEFAULT_HORIZON_URL).toBe("https://horizon-testnet.stellar.org");
  });
});
