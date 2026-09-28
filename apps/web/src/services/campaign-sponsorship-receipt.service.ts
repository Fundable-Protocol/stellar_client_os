/**
 * Campaign sponsorship receipts — issue and blockchain verification (issue #994).
 *
 * Sponsoring trees issues the sponsor a receipt describing what they paid for:
 * tree count, species, planting location, and the expected CO2 sequestration.
 * The receipt carries a SHA-256 commitment over those fields, and the sponsor
 * attaches that commitment to their payment transaction as a Stellar `hash`
 * memo. Verification is then a pure read: recompute the commitment from the
 * receipt and look the transaction up on Horizon.
 *
 * Nothing here needs a database or a signing key — the receipt is its own
 * proof, so issuing is deterministic and verification is read-only. The Horizon
 * lookup is injectable so tests (and any future cached/queued caller) can drive
 * the verification without touching the network.
 *
 * @see {@link @/lib/sponsorship-receipt} for the receipt format and checks.
 */

import { Horizon } from "@stellar/stellar-sdk";
import {
  assertTransactionHash,
  buildSponsorshipReceipt,
  verifySponsorshipReceipt,
  type ChainTransactionRecord,
  type ReceiptVerification,
  type SponsorshipReceipt,
  type SponsorshipReceiptInput,
} from "@/lib/sponsorship-receipt";
import { getStellarServerOptions } from "@/utils/rpc-connection-options";

/** Same default as `@/lib/env`, resolved here so this module stays independent of app-wide env validation. */
export const DEFAULT_HORIZON_URL = "https://horizon-testnet.stellar.org";

/** The memo a sponsor attaches so their payment can be tied back to the receipt. */
export interface TransactionMemo {
  type: "hash";
  /** 64 lowercase hex characters: `Memo.hash(Buffer.from(memoHex, "hex"))`. */
  memoHex: string;
  byteLength: 32;
}

/** How the sponsor hands the receipt back for verification. */
export interface SponsorshipReceiptVerificationHints {
  method: "PUT";
  endpoint: string;
  body: string[];
  /** A `hash` memo is the canonical commitment; a `text` memo carries the receipt id. */
  acceptedMemoTypes: string[];
}

export interface SponsorshipReceiptIssuance {
  receipt: SponsorshipReceipt;
  memo: TransactionMemo;
  verification: SponsorshipReceiptVerificationHints;
}

/** Fetch a transaction from Horizon, or resolve `null` when it does not exist. */
export type TransactionFetcher = (
  transactionHash: string,
) => Promise<ChainTransactionRecord | null>;

function isNotFound(error: unknown): boolean {
  if (error === null || typeof error !== "object") {
    return false;
  }
  const response = (error as { response?: { status?: unknown } }).response;
  return response?.status === 404;
}

/**
 * Build a Horizon-backed transaction fetcher.
 *
 * A 404 is a normal verification outcome — that hash simply is not on this
 * network yet — so it resolves to `null`. Anything else (a timeout, a 5xx, a
 * bad Horizon URL) is rethrown, so a transient outage can never be reported as
 * "not found".
 */
export function createHorizonTransactionFetcher(
  horizonUrl: string = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || DEFAULT_HORIZON_URL,
): TransactionFetcher {
  const server = new Horizon.Server(horizonUrl, getStellarServerOptions(horizonUrl));
  return async (transactionHash: string) => {
    try {
      const transaction = await server.transactions().transaction(transactionHash).call();
      return {
        hash: transaction.hash,
        successful: transaction.successful,
        memoType: transaction.memo_type,
        memo: transaction.memo ?? null,
        sourceAccount: transaction.source_account,
        // The SDK moves the scalar `ledger` aside as `ledger_attr` and replaces
        // `ledger` with a link follower, so the number lives in `ledger_attr`.
        ledger: transaction.ledger_attr,
        createdAt: transaction.created_at,
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  };
}

let cachedFetcher: TransactionFetcher | null = null;

function defaultTransactionFetcher(): TransactionFetcher {
  if (cachedFetcher === null) {
    cachedFetcher = createHorizonTransactionFetcher();
  }
  return cachedFetcher;
}

/**
 * Issue the receipt for a sponsorship.
 *
 * Returns the receipt the sponsor keeps, the memo their payment transaction
 * must carry, and how to hand the receipt back for verification.
 */
export function issueCampaignSponsorshipReceipt(
  input: SponsorshipReceiptInput,
): SponsorshipReceiptIssuance {
  const receipt = buildSponsorshipReceipt(input);
  return {
    receipt,
    memo: {
      type: "hash",
      memoHex: receipt.receiptHash,
      byteLength: 32,
    },
    verification: {
      method: "PUT",
      endpoint: `/api/campaigns/${receipt.campaignId}/sponsorship-receipt`,
      body: ["receipt", "transactionHash"],
      acceptedMemoTypes: ["hash", "text"],
    },
  };
}

/**
 * Verify a receipt against the Stellar ledger.
 *
 * `fetchTransaction` overrides the Horizon lookup; it defaults to reading the
 * network named by `NEXT_PUBLIC_STELLAR_HORIZON_URL`.
 */
export async function verifyCampaignSponsorshipReceipt(
  receipt: SponsorshipReceipt,
  transactionHash: string,
  fetchTransaction: TransactionFetcher = defaultTransactionFetcher(),
): Promise<ReceiptVerification> {
  const hash = assertTransactionHash(transactionHash);
  const transaction = await fetchTransaction(hash);
  return verifySponsorshipReceipt(receipt, transaction, hash);
}
