import { createHash } from "node:crypto";
import { TREE_SPECIES, calculateCo2Offset, getTreeSpecies } from "./co2-impact";

/**
 * Campaign sponsorship receipts.
 *
 * A receipt is a deterministic description of what a sponsor paid for — tree
 * count, species, planting location, and the expected CO2 sequestration — plus
 * a SHA-256 commitment over that description. The commitment is what goes on
 * chain: the sponsor attaches it to the payment transaction as a Stellar
 * `hash` memo, and anyone holding the receipt can recompute the commitment and
 * check it against the ledger.
 *
 * Everything in this module is a pure function of its inputs: given the same
 * sponsorship, `buildSponsorshipReceipt` always produces the same commitment,
 * which is what makes verification possible without a database. The planting
 * date is therefore required rather than defaulted, and is hashed as the plain
 * `YYYY-MM-DD` the sponsor supplied — a value the verifier must be able to
 * reproduce byte for byte.
 */

/** Schema version, hashed into the commitment so the format can never drift silently. */
export const SPONSORSHIP_RECEIPT_VERSION = 1;

/** Stellar public keys are 56 base32 characters and start with `G`. */
const STELLAR_PUBLIC_KEY_PATTERN = /^G[A-Z2-7]{55}$/;

/** Planting dates are calendar dates, never timestamps, to keep hashing timezone-free. */
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Stellar transaction hashes and SHA-256 digests are 32 bytes of lowercase hex. */
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Thrown when sponsorship input cannot produce a receipt.
 *
 * The API layer maps this to a 400: the caller's payload is wrong, nothing on
 * the server failed.
 */
export class SponsorshipReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SponsorshipReceiptError";
  }
}

export interface PlantingLocation {
  country: string;
  region: string;
  latitude: number;
  longitude: number;
}

export interface SponsorshipReceiptInput {
  campaignId: string;
  sponsorAddress: string;
  treeCount: number;
  speciesId: string;
  plantingLocation: PlantingLocation;
  /**
   * Planting date as `YYYY-MM-DD`. Required: the project's CO2 model applies a
   * rainy-season multiplier based on the month, so the date changes the
   * numbers and must be inside the commitment.
   */
  plantedAt: string;
  currency?: string | null;
  amount?: string | null;
}

export interface ReceiptSpecies {
  id: string;
  label: string;
  co2PerTreePerYearKg: number;
}

export interface ReceiptCo2 {
  perYearKg: number;
  over10YearsKg: number;
  over10YearsTonnes: number;
}

export interface SponsorshipReceipt {
  version: typeof SPONSORSHIP_RECEIPT_VERSION;
  campaignId: string;
  sponsorAddress: string;
  treeCount: number;
  species: ReceiptSpecies;
  plantingLocation: PlantingLocation;
  plantedAt: string;
  currency: string | null;
  amount: string | null;
  co2: ReceiptCo2;
  /** SHA-256 over the canonical receipt body, as lowercase hex. */
  receiptHash: string;
  /** Short human-facing handle derived from the commitment. */
  receiptId: string;
}

/** A Stellar transaction, reduced to the fields receipt verification needs. */
export interface ChainTransactionRecord {
  hash: string;
  successful: boolean;
  memoType: string;
  memo: string | null;
  sourceAccount: string;
  ledger: number;
  createdAt: string | null;
}

export type ReceiptVerificationStatus =
  | "verified"
  | "not_found"
  | "receipt_mismatch"
  | "transaction_failed"
  | "memo_mismatch"
  | "unsupported_memo";

export interface ReceiptVerificationChecks {
  transactionFound: boolean;
  /** The receipt's own fields still hash to `receiptHash` — i.e. it was not edited. */
  receiptHashMatchesContent: boolean;
  transactionSuccessful: boolean;
  memoTypeSupported: boolean;
  memoMatchesReceipt: boolean;
}

export interface ReceiptVerification {
  verified: boolean;
  status: ReceiptVerificationStatus;
  receiptId: string;
  receiptHash: string;
  transactionHash: string;
  checks: ReceiptVerificationChecks;
  reason: string | null;
  transaction: ChainTransactionRecord | null;
}

/**
 * Sort object keys recursively so two structurally equal receipts always
 * serialize identically, whatever order their properties were written in.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const sorted = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => [key, canonicalize(entry)]);
    return Object.fromEntries(sorted);
  }
  return value;
}

/** The stable serialization the commitment is computed over. */
export function canonicalizeReceiptBody(body: unknown): string {
  return JSON.stringify(canonicalize(body));
}

/** The hashed portion of a receipt: everything except the derived fields. */
export function receiptBody(receipt: SponsorshipReceipt): Record<string, unknown> {
  return {
    version: receipt.version,
    campaignId: receipt.campaignId,
    sponsorAddress: receipt.sponsorAddress,
    treeCount: receipt.treeCount,
    species: {
      id: receipt.species.id,
      label: receipt.species.label,
      co2PerTreePerYearKg: receipt.species.co2PerTreePerYearKg,
    },
    plantingLocation: {
      country: receipt.plantingLocation.country,
      region: receipt.plantingLocation.region,
      latitude: receipt.plantingLocation.latitude,
      longitude: receipt.plantingLocation.longitude,
    },
    plantedAt: receipt.plantedAt,
    currency: receipt.currency,
    amount: receipt.amount,
    co2: {
      perYearKg: receipt.co2.perYearKg,
      over10YearsKg: receipt.co2.over10YearsKg,
      over10YearsTonnes: receipt.co2.over10YearsTonnes,
    },
  };
}

/** Recompute a receipt's commitment from its own fields. */
export function computeReceiptHash(receipt: SponsorshipReceipt): string {
  return createHash("sha256")
    .update(canonicalizeReceiptBody(receiptBody(receipt)), "utf8")
    .digest("hex");
}

function requireString(value: unknown, field: string, maxLength = 256): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SponsorshipReceiptError(`${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new SponsorshipReceiptError(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

function requireTreeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SponsorshipReceiptError("treeCount must be a number");
  }
  if (!Number.isInteger(value)) {
    throw new SponsorshipReceiptError("treeCount must be a whole number of trees");
  }
  if (value <= 0) {
    throw new SponsorshipReceiptError("treeCount must be greater than 0");
  }
  return value;
}

/** Resolve a species id to the species record, rejecting ids the CO2 model does not know. */
function requireSpeciesId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SponsorshipReceiptError("speciesId is required");
  }
  const speciesId = value.trim();
  if (!TREE_SPECIES.some((species) => species.id === speciesId)) {
    const known = TREE_SPECIES.map((species) => species.id).join(", ");
    throw new SponsorshipReceiptError(
      `speciesId must be one of the supported species (${known})`,
    );
  }
  return speciesId;
}

function requireCoordinate(value: unknown, field: string, limit: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SponsorshipReceiptError(`${field} must be a number`);
  }
  if (value < -limit || value > limit) {
    throw new SponsorshipReceiptError(`${field} must be between -${limit} and ${limit}`);
  }
  return value;
}

function requirePlantingLocation(value: unknown): PlantingLocation {
  if (value === null || typeof value !== "object") {
    throw new SponsorshipReceiptError("plantingLocation is required");
  }
  const location = value as Record<string, unknown>;
  return {
    country: requireString(location.country, "plantingLocation.country", 100),
    region: requireString(location.region, "plantingLocation.region", 100),
    latitude: requireCoordinate(location.latitude, "plantingLocation.latitude", 90),
    longitude: requireCoordinate(location.longitude, "plantingLocation.longitude", 180),
  };
}

/**
 * Parse `YYYY-MM-DD` into a UTC-normalized date, rejecting impossible calendar
 * days. The UTC normalization is deliberate: the CO2 model reads the month, and
 * a local-time `Date` would let two servers in different timezones disagree
 * about a date near a month boundary.
 */
function parsePlantingDate(value: unknown): { iso: string; date: Date } {
  if (typeof value !== "string") {
    throw new SponsorshipReceiptError("plantedAt is required as a YYYY-MM-DD date");
  }
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) {
    throw new SponsorshipReceiptError("plantedAt must be a calendar date in YYYY-MM-DD form");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!isRealDate) {
    throw new SponsorshipReceiptError("plantedAt must be a real calendar date");
  }
  return { iso: `${match[1]}-${match[2]}-${match[3]}`, date };
}

function optionalString(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new SponsorshipReceiptError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new SponsorshipReceiptError(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

/**
 * Validate an untrusted sponsorship payload into a normalized receipt input.
 *
 * This is the boundary every entry point goes through — the API's issue route
 * and {@link buildSponsorshipReceipt} alike — so validation lives in exactly
 * one place and a malformed payload can never reach the commitment.
 */
export function parseSponsorshipReceiptInput(value: unknown): SponsorshipReceiptInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SponsorshipReceiptError("A sponsorship receipt payload object is required");
  }
  const input = value as Record<string, unknown>;

  const sponsorAddress = requireString(input.sponsorAddress, "sponsorAddress", 56);
  if (!STELLAR_PUBLIC_KEY_PATTERN.test(sponsorAddress)) {
    throw new SponsorshipReceiptError("sponsorAddress must be a Stellar public key");
  }

  return {
    campaignId: requireString(input.campaignId, "campaignId", 128),
    sponsorAddress,
    treeCount: requireTreeCount(input.treeCount),
    speciesId: requireSpeciesId(input.speciesId),
    plantingLocation: requirePlantingLocation(input.plantingLocation),
    // Normalized to the exact string that gets hashed, so a payload written with
    // padding or a different separator cannot produce a different commitment.
    plantedAt: parsePlantingDate(input.plantedAt).iso,
    currency: optionalString(input.currency, "currency", 12),
    amount: optionalString(input.amount, "amount", 40),
  };
}

/**
 * Build the deterministic receipt for a sponsorship.
 *
 * Throws {@link SponsorshipReceiptError} when the input cannot describe a real
 * sponsorship, so a malformed request never produces an unverifiable receipt.
 */
export function buildSponsorshipReceipt(input: SponsorshipReceiptInput): SponsorshipReceipt {
  const normalized = parseSponsorshipReceiptInput(input);
  const species = getTreeSpecies(normalized.speciesId);
  const impact = calculateCo2Offset(
    species.id,
    normalized.treeCount,
    parsePlantingDate(normalized.plantedAt).date,
  );

  const receipt: SponsorshipReceipt = {
    version: SPONSORSHIP_RECEIPT_VERSION,
    campaignId: normalized.campaignId,
    sponsorAddress: normalized.sponsorAddress,
    treeCount: normalized.treeCount,
    species: {
      id: species.id,
      label: species.label,
      co2PerTreePerYearKg: species.co2PerTreePerYearKg,
    },
    plantingLocation: normalized.plantingLocation,
    plantedAt: normalized.plantedAt,
    currency: normalized.currency ?? null,
    amount: normalized.amount ?? null,
    co2: {
      perYearKg: impact.co2PerYearKg,
      over10YearsKg: impact.co2Over10YearsKg,
      over10YearsTonnes: impact.co2Over10YearsTonnes,
    },
    receiptHash: "",
    receiptId: "",
  };

  const receiptHash = computeReceiptHash(receipt);
  return {
    ...receipt,
    receiptHash,
    receiptId: `rcpt_${receiptHash.slice(0, 16)}`,
  };
}

/**
 * Validate a receipt that arrived from a client, so the verifier only ever
 * works with a well-formed document. The commitment is *not* trusted here —
 * {@link verifySponsorshipReceipt} recomputes it from these fields.
 */
export function parseSponsorshipReceipt(value: unknown): SponsorshipReceipt {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SponsorshipReceiptError("A receipt object is required");
  }
  const candidate = value as Record<string, unknown>;

  if (candidate.version !== SPONSORSHIP_RECEIPT_VERSION) {
    throw new SponsorshipReceiptError(
      `Unsupported receipt version: expected ${SPONSORSHIP_RECEIPT_VERSION}`,
    );
  }
  if (typeof candidate.receiptHash !== "string" || !SHA256_HEX_PATTERN.test(candidate.receiptHash)) {
    throw new SponsorshipReceiptError("receiptHash must be 64 lowercase hex characters");
  }

  // A stored receipt nests the species record; the payload shape that arrived
  // when it was issued carried a flat `speciesId`. Accept the nesting and let
  // the shared validator check everything else.
  const rebuilt = buildSponsorshipReceipt(
    parseSponsorshipReceiptInput({
      ...candidate,
      speciesId: (candidate.species as { id?: unknown } | undefined)?.id,
    }),
  );

  return {
    ...rebuilt,
    // Keep the claimed commitment rather than the recomputed one: verification
    // detects an edited receipt by comparing the two, which it cannot do if the
    // claim is overwritten here. Derived fields (species label and rate, CO2)
    // are intentionally recomputed from the primitives above, so editing them
    // changes nothing — they are not authoritative.
    receiptHash: candidate.receiptHash,
    receiptId:
      typeof candidate.receiptId === "string" && candidate.receiptId.length > 0
        ? candidate.receiptId
        : rebuilt.receiptId,
  };
}

/**
 * Receipt tokens (issue #926).
 *
 * A token is the whole receipt packed into one URL- and QR-safe string:
 * `fsr1.<base64url(canonical JSON)>`. It carries the hashed body plus the
 * claimed commitment, so it is self-contained — whoever holds the token can
 * reproduce the receipt and check it against the ledger without asking the
 * issuer for anything. The prefix names the token format; the receipt version
 * inside the body names the receipt format, so the two can evolve separately.
 */
export const SPONSORSHIP_RECEIPT_TOKEN_PREFIX = "fsr1";

/** Base64url alphabet, no padding — what `Buffer#toString("base64url")` emits. */
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Upper bound on an encoded token. A real receipt is well under 1 KB; the cap
 * keeps an oversized query string or body from being decoded and parsed.
 */
export const MAX_SPONSORSHIP_RECEIPT_TOKEN_LENGTH = 4096;

/** Pack a receipt into its portable token. */
export function encodeSponsorshipReceiptToken(receipt: SponsorshipReceipt): string {
  const payload = canonicalizeReceiptBody({
    ...receiptBody(receipt),
    receiptHash: receipt.receiptHash,
    receiptId: receipt.receiptId,
  });
  return `${SPONSORSHIP_RECEIPT_TOKEN_PREFIX}.${Buffer.from(payload, "utf8").toString("base64url")}`;
}

/**
 * Unpack a token into a validated receipt.
 *
 * Like {@link parseSponsorshipReceipt}, this does not trust the commitment the
 * token carries — it only guarantees a well-formed receipt. Whether the fields
 * still hash to `receiptHash` is decided by {@link verifySponsorshipReceipt}.
 */
export function decodeSponsorshipReceiptToken(token: unknown): SponsorshipReceipt {
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new SponsorshipReceiptError("token is required");
  }
  const trimmed = token.trim();
  if (trimmed.length > MAX_SPONSORSHIP_RECEIPT_TOKEN_LENGTH) {
    throw new SponsorshipReceiptError(
      `token must be at most ${MAX_SPONSORSHIP_RECEIPT_TOKEN_LENGTH} characters`,
    );
  }

  const separator = trimmed.indexOf(".");
  const prefix = separator === -1 ? "" : trimmed.slice(0, separator);
  const encoded = separator === -1 ? "" : trimmed.slice(separator + 1);
  if (prefix !== SPONSORSHIP_RECEIPT_TOKEN_PREFIX) {
    throw new SponsorshipReceiptError(
      `token must start with "${SPONSORSHIP_RECEIPT_TOKEN_PREFIX}."`,
    );
  }
  if (!BASE64URL_PATTERN.test(encoded)) {
    throw new SponsorshipReceiptError("token payload must be base64url encoded");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new SponsorshipReceiptError("token payload is not a receipt");
  }
  return parseSponsorshipReceipt(payload);
}

/** The fields a sponsor-facing receipt shows, already formatted for display. */
export interface SponsorshipReceiptSummary {
  receiptId: string;
  treeCount: number;
  species: string;
  plantingLocation: string;
  coordinates: string;
  plantedAt: string;
  expectedCo2PerYearKg: number;
  expectedCo2Over10YearsTonnes: number;
  /** One line suitable for a receipt header or a share message. */
  headline: string;
}

/** Summarize a receipt for display: tree count, species, location, expected CO2. */
export function summarizeSponsorshipReceipt(receipt: SponsorshipReceipt): SponsorshipReceiptSummary {
  const { plantingLocation: location } = receipt;
  const trees = `${receipt.treeCount} ${receipt.species.label} ${receipt.treeCount === 1 ? "tree" : "trees"}`;
  const place = `${location.region}, ${location.country}`;
  return {
    receiptId: receipt.receiptId,
    treeCount: receipt.treeCount,
    species: receipt.species.label,
    plantingLocation: place,
    coordinates: `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
    plantedAt: receipt.plantedAt,
    expectedCo2PerYearKg: receipt.co2.perYearKg,
    expectedCo2Over10YearsTonnes: receipt.co2.over10YearsTonnes,
    headline: `${trees} planted in ${place} on ${receipt.plantedAt}, expected to sequester ${receipt.co2.over10YearsTonnes} t CO2 over 10 years`,
  };
}

/** Assert a transaction hash is the 32-byte hex string Horizon uses. */
export function assertTransactionHash(value: unknown): string {
  if (typeof value !== "string" || !SHA256_HEX_PATTERN.test(value.trim().toLowerCase())) {
    throw new SponsorshipReceiptError("transactionHash must be a 64-character hex hash");
  }
  return value.trim().toLowerCase();
}

/**
 * Normalize a `hash` memo to lowercase hex.
 *
 * Horizon base64-encodes hash memos, but a caller assembling a transaction
 * locally (or an SDK record) may hand us the raw 32 bytes as hex, so accept
 * both and reject anything that is neither.
 */
export function memoHashToHex(memo: string): string | null {
  const trimmed = memo.trim();
  if (SHA256_HEX_PATTERN.test(trimmed.toLowerCase())) {
    return trimmed.toLowerCase();
  }
  const decoded = Buffer.from(trimmed, "base64");
  return decoded.length === 32 ? decoded.toString("hex") : null;
}

function memoMatches(
  receipt: SponsorshipReceipt,
  transaction: ChainTransactionRecord,
): { supported: boolean; matches: boolean } {
  const memo = transaction.memo;
  if (transaction.memoType === "hash") {
    const hex = typeof memo === "string" ? memoHashToHex(memo) : null;
    return { supported: true, matches: hex !== null && hex === receipt.receiptHash };
  }
  if (transaction.memoType === "text") {
    return { supported: true, matches: memo === receipt.receiptId };
  }
  return { supported: false, matches: false };
}

/**
 * Check a receipt against the transaction it claims to be bound to.
 *
 * The order of the checks is the order a reader cares about: is the receipt
 * itself intact, does the transaction exist, did it succeed, and does it carry
 * the commitment. `verified` is true only when all of them pass.
 */
export function verifySponsorshipReceipt(
  receipt: SponsorshipReceipt,
  transaction: ChainTransactionRecord | null,
  transactionHash?: string,
): ReceiptVerification {
  const recomputed = computeReceiptHash(receipt);
  const receiptHashMatchesContent = recomputed === receipt.receiptHash;
  const memo =
    transaction === null ? { supported: false, matches: false } : memoMatches(receipt, transaction);

  const checks: ReceiptVerificationChecks = {
    transactionFound: transaction !== null,
    receiptHashMatchesContent,
    transactionSuccessful: transaction !== null && transaction.successful,
    memoTypeSupported: transaction !== null && memo.supported,
    memoMatchesReceipt: transaction !== null && memo.supported && memo.matches,
  };

  const base = {
    receiptId: receipt.receiptId,
    receiptHash: receipt.receiptHash,
    transactionHash: transactionHash ?? transaction?.hash ?? "",
    checks,
    transaction,
  };

  if (!receiptHashMatchesContent) {
    return {
      ...base,
      verified: false,
      status: "receipt_mismatch",
      reason:
        "The receipt fields do not hash to the receiptHash it carries, so the receipt was altered after it was issued.",
    };
  }
  if (transaction === null) {
    return {
      ...base,
      verified: false,
      status: "not_found",
      reason: "No Stellar transaction with that hash was found.",
    };
  }
  if (!transaction.successful) {
    return {
      ...base,
      verified: false,
      status: "transaction_failed",
      reason: "The transaction exists but did not succeed on the ledger.",
    };
  }
  if (!memo.supported) {
    return {
      ...base,
      verified: false,
      status: "unsupported_memo",
      reason: `The transaction carries a "${transaction.memoType}" memo. A receipt commitment travels in a hash memo (or the receipt id in a text memo).`,
    };
  }
  if (!memo.matches) {
    return {
      ...base,
      verified: false,
      status: "memo_mismatch",
      reason:
        transaction.memoType === "hash"
          ? "The transaction's memo hash is not this receipt's commitment."
          : "The transaction's text memo is not this receipt's id.",
    };
  }

  return {
    ...base,
    verified: true,
    status: "verified",
    reason: null,
  };
}
