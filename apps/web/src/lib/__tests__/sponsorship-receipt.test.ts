import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  MAX_SPONSORSHIP_RECEIPT_TOKEN_LENGTH,
  SPONSORSHIP_RECEIPT_TOKEN_PREFIX,
  SPONSORSHIP_RECEIPT_VERSION,
  SponsorshipReceiptError,
  assertTransactionHash,
  buildSponsorshipReceipt,
  canonicalizeReceiptBody,
  computeReceiptHash,
  decodeSponsorshipReceiptToken,
  encodeSponsorshipReceiptToken,
  memoHashToHex,
  parseSponsorshipReceipt,
  parseSponsorshipReceiptInput,
  receiptBody,
  summarizeSponsorshipReceipt,
  verifySponsorshipReceipt,
  type ChainTransactionRecord,
  type SponsorshipReceipt,
  type SponsorshipReceiptInput,
} from "../sponsorship-receipt";

const SPONSOR = "GD6BXVRVMEPHHXNZYVCI6HIJIB4OOGEFMVZ6OD2EWE37WCTMOVOCNJUW";
const OTHER_SPONSOR = "GDQJUTQYK2MQX2VGDR2FYWLIYAQIEGXTQVTFEMGH2BEWFG4BRUY4CKI7";
const TRANSACTION_HASH = "a".repeat(64);

/** Horizon base64-encodes hash memos; the raw hex form is what we hash. */
const hashMemo = (value: string) => Buffer.from(value, "hex").toString("base64");

function baseInput(overrides: Partial<SponsorshipReceiptInput> = {}): SponsorshipReceiptInput {
  return {
    campaignId: "camp-101",
    sponsorAddress: SPONSOR,
    treeCount: 100,
    speciesId: "oak",
    plantingLocation: { country: "Kenya", region: "Nyeri", latitude: -0.42, longitude: 36.95 },
    plantedAt: "2026-06-15",
    currency: "XLM",
    amount: "250.0000000",
    ...overrides,
  };
}

function transactionFor(
  receipt: SponsorshipReceipt,
  overrides: Partial<ChainTransactionRecord> = {},
): ChainTransactionRecord {
  return {
    hash: TRANSACTION_HASH,
    successful: true,
    memoType: "hash",
    memo: hashMemo(receipt.receiptHash),
    sourceAccount: receipt.sponsorAddress,
    ledger: 1234567,
    createdAt: "2026-06-16T00:00:00Z",
    ...overrides,
  };
}

describe("buildSponsorshipReceipt", () => {
  it("derives the same commitment for the same sponsorship every time", () => {
    const first = buildSponsorshipReceipt(baseInput());
    const second = buildSponsorshipReceipt(baseInput());

    expect(first.receiptHash).toBe(second.receiptHash);
    expect(first.receiptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.receiptId).toBe(`rcpt_${first.receiptHash.slice(0, 16)}`);
    expect(first.version).toBe(SPONSORSHIP_RECEIPT_VERSION);
  });

  it("describes the tree count, species, location, and projected sequestration", () => {
    const receipt = buildSponsorshipReceipt(baseInput());

    expect(receipt.treeCount).toBe(100);
    expect(receipt.species).toMatchObject({ id: "oak", label: "Oak", co2PerTreePerYearKg: 21 });
    expect(receipt.plantingLocation).toEqual({
      country: "Kenya",
      region: "Nyeri",
      latitude: -0.42,
      longitude: 36.95,
    });
    // 100 oak kept through the rainy season: 100 * 21 kg * 2x bonus.
    expect(receipt.co2.perYearKg).toBe(4200);
    expect(receipt.co2.over10YearsKg).toBe(42000);
    expect(receipt.co2.over10YearsTonnes).toBeCloseTo(42);
  });

  it("uses the selected species uptake rate", () => {
    const oak = buildSponsorshipReceipt(baseInput({ speciesId: "oak" }));
    const eucalyptus = buildSponsorshipReceipt(baseInput({ speciesId: "eucalyptus" }));

    expect(eucalyptus.co2.perYearKg).toBeGreaterThan(oak.co2.perYearKg);
    expect(eucalyptus.receiptHash).not.toBe(oak.receiptHash);
  });

  it("changes the commitment when a field of the sponsorship changes", () => {
    const base = buildSponsorshipReceipt(baseInput()).receiptHash;

    expect(buildSponsorshipReceipt(baseInput({ campaignId: "camp-202" })).receiptHash).not.toBe(base);
    expect(buildSponsorshipReceipt(baseInput({ sponsorAddress: OTHER_SPONSOR })).receiptHash).not.toBe(base);
    expect(buildSponsorshipReceipt(baseInput({ treeCount: 101 })).receiptHash).not.toBe(base);
    expect(buildSponsorshipReceipt(baseInput({ plantedAt: "2026-01-15" })).receiptHash).not.toBe(base);
    expect(buildSponsorshipReceipt(baseInput({ amount: "251" })).receiptHash).not.toBe(base);
    expect(buildSponsorshipReceipt(baseInput({ amount: null })).receiptHash).not.toBe(base);
    expect(
      buildSponsorshipReceipt(
        baseInput({
          plantingLocation: { country: "Kenya", region: "Nyeri", latitude: -0.43, longitude: 36.95 },
        }),
      ).receiptHash,
    ).not.toBe(base);
  });

  it("applies the rainy-season multiplier from the planting date, so the date is inside the commitment", () => {
    const rainy = buildSponsorshipReceipt(baseInput({ plantedAt: "2026-06-15" }));
    const dry = buildSponsorshipReceipt(baseInput({ plantedAt: "2026-01-15" }));

    expect(rainy.co2.perYearKg).toBe(dry.co2.perYearKg * 2);
    expect(rainy.receiptHash).not.toBe(dry.receiptHash);
  });

  it("records a missing currency or amount as null", () => {
    const receipt = buildSponsorshipReceipt(baseInput({ currency: undefined, amount: undefined }));

    expect(receipt.currency).toBeNull();
    expect(receipt.amount).toBeNull();
  });
});

describe("receiptBody", () => {
  it("covers the claimed sponsorship and leaves the derived handles out", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const body = receiptBody(receipt);

    expect(Object.keys(body).sort()).toEqual(
      [
        "amount",
        "campaignId",
        "co2",
        "currency",
        "plantedAt",
        "plantingLocation",
        "species",
        "sponsorAddress",
        "treeCount",
        "version",
      ].sort(),
    );
    expect(body).not.toHaveProperty("receiptHash");
    expect(body).not.toHaveProperty("receiptId");
    expect(body).not.toHaveProperty("speciesId");
  });

  it("recomputes to the commitment the receipt carries", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const expected = createHash("sha256")
      .update(canonicalizeReceiptBody(receiptBody(receipt)), "utf8")
      .digest("hex");

    expect(receipt.receiptHash).toBe(expected);
    expect(computeReceiptHash(receipt)).toBe(receipt.receiptHash);
  });
});

describe("canonicalizeReceiptBody", () => {
  it("ignores property order so two equal bodies hash alike", () => {
    const first = canonicalizeReceiptBody({ b: 1, a: { d: 2, c: 3 } });
    const second = canonicalizeReceiptBody({ a: { c: 3, d: 2 }, b: 1 });

    expect(first).toBe(second);
  });
});

describe("parseSponsorshipReceiptInput", () => {
  it("normalizes the fields the commitment is computed over", () => {
    const parsed = parseSponsorshipReceiptInput({
      ...baseInput({ currency: undefined }),
      campaignId: "  camp-101  ",
    });

    expect(parsed.campaignId).toBe("camp-101");
    expect(parsed.plantedAt).toBe("2026-06-15");
    expect(parsed.currency).toBeNull();
    expect(parsed.speciesId).toBe("oak");
  });

  it("rejects a payload that is not an object", () => {
    expect(() => parseSponsorshipReceiptInput(null)).toThrow(SponsorshipReceiptError);
    expect(() => parseSponsorshipReceiptInput([baseInput()])).toThrow(
      "A sponsorship receipt payload object is required",
    );
    expect(() => parseSponsorshipReceiptInput("camp-101")).toThrow(
      "A sponsorship receipt payload object is required",
    );
  });

  it.each([
    ["a non-Stellar sponsor address", { sponsorAddress: "not-a-key" }, /Stellar public key/],
    ["a missing sponsor address", { sponsorAddress: "" }, /sponsorAddress is required/],
    ["a missing campaign id", { campaignId: "" }, /campaignId is required/],
    ["zero trees", { treeCount: 0 }, /greater than 0/],
    ["a negative tree count", { treeCount: -5 }, /greater than 0/],
    ["a fractional tree count", { treeCount: 2.5 }, /whole number/],
    ["a non-numeric tree count", { treeCount: "100" }, /treeCount must be a number/],
    ["an unsupported species", { speciesId: "baobab" }, /supported species/],
    ["a missing species", { speciesId: undefined }, /speciesId is required/],
    ["a non-calendar planting date", { plantedAt: "2026-02-30" }, /real calendar date/],
    ["a non-ISO planting date", { plantedAt: "15/06/2026" }, /YYYY-MM-DD/],
    ["an unpadded planting date", { plantedAt: "2026-6-5" }, /YYYY-MM-DD/],
    ["a missing planting date", { plantedAt: undefined }, /plantedAt is required/],
    ["a missing planting location", { plantingLocation: undefined }, /plantingLocation is required/],
    ["a location without a country", {
      plantingLocation: { country: "", region: "Nyeri", latitude: 0, longitude: 0 },
    }, /plantingLocation.country is required/],
    ["a latitude past the pole", {
      plantingLocation: { country: "Kenya", region: "Nyeri", latitude: 91, longitude: 0 },
    }, /latitude must be between -90 and 90/],
    ["a longitude past the antimeridian", {
      plantingLocation: { country: "Kenya", region: "Nyeri", latitude: 0, longitude: 181 },
    }, /longitude must be between -180 and 180/],
    ["a non-numeric coordinate", {
      plantingLocation: { country: "Kenya", region: "Nyeri", latitude: "0", longitude: 0 },
    }, /latitude must be a number/],
    ["a non-string currency", { currency: 42 }, /currency must be a string/],
  ])("rejects %s", (_label, overrides, message) => {
    expect(() =>
      parseSponsorshipReceiptInput({ ...baseInput(), ...(overrides as Record<string, unknown>) }),
    ).toThrow(message);
  });
});

describe("parseSponsorshipReceipt", () => {
  it("round-trips a receipt through JSON", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const parsed = parseSponsorshipReceipt(JSON.parse(JSON.stringify(receipt)));

    expect(parsed).toEqual(receipt);
  });

  it.each([
    ["a version the verifier does not know", (receipt: SponsorshipReceipt) => ({ ...receipt, version: 2 }), /Unsupported receipt version/],
    ["an uppercase commitment", (receipt: SponsorshipReceipt) => ({ ...receipt, receiptHash: receipt.receiptHash.toUpperCase() }), /64 lowercase hex/],
    ["a truncated commitment", (receipt: SponsorshipReceipt) => ({ ...receipt, receiptHash: receipt.receiptHash.slice(0, 32) }), /64 lowercase hex/],
    ["a missing commitment", (receipt: SponsorshipReceipt) => ({ ...receipt, receiptHash: undefined }), /64 lowercase hex/],
    ["a missing species", (receipt: SponsorshipReceipt) => ({ ...receipt, species: undefined }), /speciesId is required/],
  ])("rejects %s", (_label, mutate, message) => {
    const receipt = buildSponsorshipReceipt(baseInput());
    expect(() => parseSponsorshipReceipt(mutate(receipt))).toThrow(message);
  });

  it("keeps the claimant's commitment so an edited receipt is detectable", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const edited = { ...receipt, treeCount: receipt.treeCount + 1 };

    const parsed = parseSponsorshipReceipt(edited);

    expect(parsed.treeCount).toBe(101);
    expect(parsed.receiptHash).toBe(receipt.receiptHash);
    expect(computeReceiptHash(parsed)).not.toBe(parsed.receiptHash);
  });

  it("recomputes derived fields, so editing them changes nothing", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const parsed = parseSponsorshipReceipt({
      ...receipt,
      species: { id: "oak", label: "Definitely Oak", co2PerTreePerYearKg: 9999 },
      co2: { perYearKg: 9999, over10YearsKg: 9999, over10YearsTonnes: 9999 },
    });

    expect(parsed.species.label).toBe("Oak");
    expect(parsed.co2).toEqual(receipt.co2);
    expect(computeReceiptHash(parsed)).toBe(parsed.receiptHash);
  });
});

describe("memoHashToHex", () => {
  it("decodes the base64 form Horizon returns for a hash memo", () => {
    expect(memoHashToHex(hashMemo(TRANSACTION_HASH))).toBe(TRANSACTION_HASH);
  });

  it("passes through a hex memo and normalizes its case", () => {
    expect(memoHashToHex(TRANSACTION_HASH)).toBe(TRANSACTION_HASH);
    expect(memoHashToHex(TRANSACTION_HASH.toUpperCase())).toBe(TRANSACTION_HASH);
  });

  it("rejects a memo that is neither a 32-byte digest nor its base64 encoding", () => {
    expect(memoHashToHex("not-a-hash")).toBeNull();
    expect(memoHashToHex(Buffer.alloc(16).toString("base64"))).toBeNull();
  });
});

describe("assertTransactionHash", () => {
  it("accepts a hex hash and lowercases it", () => {
    expect(assertTransactionHash(TRANSACTION_HASH.toUpperCase())).toBe(TRANSACTION_HASH);
  });

  it.each([["a short hash", "abc"], ["a non-hex hash", "z".repeat(64)], ["a non-string hash", 42]])(
    "rejects %s",
    (_label, value) => {
      expect(() => assertTransactionHash(value)).toThrow(SponsorshipReceiptError);
    },
  );
});

describe("verifySponsorshipReceipt", () => {
  it("verifies a successful transaction whose hash memo is the commitment", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const result = verifySponsorshipReceipt(
      receipt,
      transactionFor(receipt),
      TRANSACTION_HASH,
    );

    expect(result).toMatchObject({
      verified: true,
      status: "verified",
      reason: null,
      receiptId: receipt.receiptId,
      receiptHash: receipt.receiptHash,
      transactionHash: TRANSACTION_HASH,
    });
    expect(result.checks).toEqual({
      transactionFound: true,
      receiptHashMatchesContent: true,
      transactionSuccessful: true,
      memoTypeSupported: true,
      memoMatchesReceipt: true,
    });
  });

  it("verifies a raw hex memo as well as the base64 form", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const result = verifySponsorshipReceipt(
      receipt,
      transactionFor(receipt, { memo: receipt.receiptHash }),
    );

    expect(result.status).toBe("verified");
  });

  it("verifies a text memo carrying the receipt id", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const result = verifySponsorshipReceipt(
      receipt,
      transactionFor(receipt, { memoType: "text", memo: receipt.receiptId }),
    );

    expect(result.status).toBe("verified");
  });

  it("reports a missing transaction instead of failing the request", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const result = verifySponsorshipReceipt(receipt, null, TRANSACTION_HASH);

    expect(result.verified).toBe(false);
    expect(result.status).toBe("not_found");
    expect(result.transaction).toBeNull();
    expect(result.checks.transactionFound).toBe(false);
    expect(result.transactionHash).toBe(TRANSACTION_HASH);
  });

  it("reports a transaction that did not succeed on the ledger", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const result = verifySponsorshipReceipt(receipt, transactionFor(receipt, { successful: false }));

    expect(result.status).toBe("transaction_failed");
    expect(result.checks.transactionSuccessful).toBe(false);
  });

  it("falls back to the transaction hash when none was supplied", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const result = verifySponsorshipReceipt(receipt, transactionFor(receipt));

    expect(result.transactionHash).toBe(TRANSACTION_HASH);
  });

  it("rejects a memo type that cannot carry a commitment", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const result = verifySponsorshipReceipt(
      receipt,
      transactionFor(receipt, { memoType: "id", memo: "12345" }),
    );

    expect(result.verified).toBe(false);
    expect(result.status).toBe("unsupported_memo");
    expect(result.checks.memoTypeSupported).toBe(false);
  });

  it("rejects a hash memo that commits to something else", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const result = verifySponsorshipReceipt(
      receipt,
      transactionFor(receipt, { memo: hashMemo("b".repeat(64)) }),
    );

    expect(result.verified).toBe(false);
    expect(result.status).toBe("memo_mismatch");
    expect(result.checks.memoMatchesReceipt).toBe(false);
  });

  it("rejects a text memo that is not the receipt id", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const result = verifySponsorshipReceipt(
      receipt,
      transactionFor(receipt, { memoType: "text", memo: "rcpt_someone_else" }),
    );

    expect(result.status).toBe("memo_mismatch");
  });

  it("reports an edited receipt as a receipt mismatch even when the memo matches", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const edited = parseSponsorshipReceipt({ ...receipt, treeCount: receipt.treeCount + 1 });
    const result = verifySponsorshipReceipt(edited, transactionFor(receipt), TRANSACTION_HASH);

    expect(result.verified).toBe(false);
    expect(result.status).toBe("receipt_mismatch");
    expect(result.checks.receiptHashMatchesContent).toBe(false);
    expect(result.checks.memoMatchesReceipt).toBe(true);
  });
});

describe("sponsorship receipt tokens (issue #926)", () => {
  it("round-trips a receipt through its token", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const token = encodeSponsorshipReceiptToken(receipt);

    expect(token.startsWith(`${SPONSORSHIP_RECEIPT_TOKEN_PREFIX}.`)).toBe(true);
    expect(token).toMatch(/^fsr1\.[A-Za-z0-9_-]+$/);
    expect(decodeSponsorshipReceiptToken(token)).toEqual(receipt);
  });

  it("encodes the same receipt to the same token", () => {
    const first = encodeSponsorshipReceiptToken(buildSponsorshipReceipt(baseInput()));
    const second = encodeSponsorshipReceiptToken(buildSponsorshipReceipt(baseInput()));

    expect(first).toBe(second);
  });

  it("keeps a token small enough for a QR code", () => {
    const token = encodeSponsorshipReceiptToken(buildSponsorshipReceipt(baseInput()));

    expect(token.length).toBeLessThan(1024);
  });

  it("carries the claimed commitment so an edited token fails verification", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const payload = JSON.parse(
      Buffer.from(encodeSponsorshipReceiptToken(receipt).slice(5), "base64url").toString("utf8"),
    );
    const forged = `fsr1.${Buffer.from(
      JSON.stringify({ ...payload, treeCount: 1000 }),
      "utf8",
    ).toString("base64url")}`;

    const decoded = decodeSponsorshipReceiptToken(forged);
    const result = verifySponsorshipReceipt(decoded, transactionFor(receipt), TRANSACTION_HASH);

    expect(decoded.treeCount).toBe(1000);
    expect(decoded.receiptHash).toBe(receipt.receiptHash);
    expect(result.status).toBe("receipt_mismatch");
  });

  it.each([
    ["a missing token", undefined, "token is required"],
    ["an empty token", "   ", "token is required"],
    ["the wrong prefix", "abc.eyJ9", 'token must start with "fsr1."'],
    ["no separator", "fsr1", 'token must start with "fsr1."'],
    ["a non-base64url payload", "fsr1.not/base64+", "token payload must be base64url encoded"],
    ["a payload that is not JSON", `fsr1.${Buffer.from("nope").toString("base64url")}`, "token payload is not a receipt"],
    ["an oversized token", `fsr1.${"a".repeat(MAX_SPONSORSHIP_RECEIPT_TOKEN_LENGTH)}`, "token must be at most"],
  ])("rejects %s", (_label, token, message) => {
    expect(() => decodeSponsorshipReceiptToken(token)).toThrow(SponsorshipReceiptError);
    expect(() => decodeSponsorshipReceiptToken(token)).toThrow(message);
  });

  it("rejects a token whose payload is not a valid receipt", () => {
    const token = `fsr1.${Buffer.from(JSON.stringify({ version: 1 })).toString("base64url")}`;

    expect(() => decodeSponsorshipReceiptToken(token)).toThrow(SponsorshipReceiptError);
  });
});

describe("summarizeSponsorshipReceipt", () => {
  it("shows tree count, species, location, and expected CO2", () => {
    const receipt = buildSponsorshipReceipt(baseInput());
    const summary = summarizeSponsorshipReceipt(receipt);

    expect(summary).toMatchObject({
      receiptId: receipt.receiptId,
      treeCount: 100,
      species: "Oak",
      plantingLocation: "Nyeri, Kenya",
      coordinates: "-0.4200, 36.9500",
      plantedAt: "2026-06-15",
      expectedCo2PerYearKg: receipt.co2.perYearKg,
      expectedCo2Over10YearsTonnes: receipt.co2.over10YearsTonnes,
    });
    expect(summary.headline).toBe(
      `100 Oak trees planted in Nyeri, Kenya on 2026-06-15, expected to sequester ${receipt.co2.over10YearsTonnes} t CO2 over 10 years`,
    );
  });

  it("uses the singular for a single tree", () => {
    const summary = summarizeSponsorshipReceipt(buildSponsorshipReceipt(baseInput({ treeCount: 1 })));

    expect(summary.headline.startsWith("1 Oak tree planted")).toBe(true);
  });
});
