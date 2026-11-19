/**
 * Tax reporting helpers — issue #792
 *
 * Computes a campaign creator's gross annual earnings from the contributions /
 * payouts they received in a given tax year (the "funding received" that drives
 * IRS 1099-NEC / EU VAT / other tax-form generation) and maps a creator's tax
 * jurisdiction to the matching document type.
 *
 * Amounts are expressed as integer USDC strings (no fractional part), matching
 * the convention used across the platform's campaign data.
 */

export interface CreatorEarningsParams {
  /** Stellar-wallet public key of the campaign creator (G…/C…). */
  creatorId: string;
  /** Calendar tax year, e.g. 2025. */
  taxYear: number;
}

export interface EarningsTransaction {
  /** Gross amount in integer USDC units (e.g. "1000" = 1,000 USDC). */
  amount: string;
  /** Unix timestamp (milliseconds) of the transaction. */
  timestamp: number;
  /** Optional human-readable reference, e.g. "campaign-1:sponsor-9". */
  reference?: string;
}

/** Record returned for 1099-style reporting. */
export interface TaxForm1099Record {
  creatorId: string;
  taxYear: number;
  /** Gross USDC earnings formatted with two decimals, e.g. "12500.00". */
  grossEarningsUSDC: string;
  /** Number of transactions that fell inside the tax year. */
  totalTransactions: number;
  /** ISO 8601 timestamp of when the record was generated. */
  generatedAt: string;
}

/** Creator tax jurisdictions the SDK can map to a document type. */
export type TaxJurisdiction = "US" | "EU" | "OTHER";

/**
 * Supported tax-document types:
 * - `us-1099-nec`  — IRS 1099-NEC (nonemployee compensation) for US creators
 * - `eu-vat-oss`   — EU VAT OSS annual summary for EU creators
 * - `earnings-statement` — generic annual earnings statement for other jurisdictions
 */
export type TaxFormKind = "us-1099-nec" | "eu-vat-oss" | "earnings-statement";

const USDC_SCALE = 1n;

function isInTaxYear(transaction: EarningsTransaction, taxYear: number): boolean {
  return new Date(transaction.timestamp).getUTCFullYear() === taxYear;
}

/**
 * Format an integer USDC amount (in whole units) with two decimal places,
 * e.g. `12500n` → `"12500.00"`.
 */
export function formatUsdcFromInteger(units: bigint): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / USDC_SCALE;
  const fraction = absolute % USDC_SCALE;
  const normalized = `${whole}.${fraction.toString().padStart(2, "0")}`;
  return negative ? `-${normalized}` : normalized;
}

/** Map a tax jurisdiction to the tax-document type to generate. */
export function selectTaxForm(jurisdiction: TaxJurisdiction): TaxFormKind {
  switch (jurisdiction) {
    case "US":
      return "us-1099-nec";
    case "EU":
      return "eu-vat-oss";
    case "OTHER":
      return "earnings-statement";
  }
}

/**
 * Compute gross annual earnings from the given transactions for a tax year.
 *
 * Only transactions whose UTC timestamp falls inside `taxYear` are counted.
 * Returns zeroed totals when there is no qualifying activity.
 */
export function computeAnnualEarnings(
  transactions: readonly EarningsTransaction[],
  taxYear: number,
): { grossEarningsUSDC: string; totalTransactions: number } {
  let total = 0n;
  let count = 0;

  for (const transaction of transactions) {
    if (!isInTaxYear(transaction, taxYear)) continue;
    total += BigInt(transaction.amount || "0");
    count += 1;
  }

  return { grossEarningsUSDC: formatUsdcFromInteger(total), totalTransactions: count };
}

/**
 * Thin client for compiling annual creator earnings into 1099-ready form data.
 *
 * Milestone-based payouts are passed in as {@link EarningsTransaction} entries;
 * without them the SDK reports zeros rather than fabricating placeholder data.
 */
export class TaxReportingSDK {
  private rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  async getAnnualEarnings(
    params: CreatorEarningsParams,
    transactions: readonly EarningsTransaction[] = [],
  ): Promise<TaxForm1099Record> {
    const earnings = computeAnnualEarnings(transactions, params.taxYear);
    return {
      creatorId: params.creatorId,
      taxYear: params.taxYear,
      grossEarningsUSDC: earnings.grossEarningsUSDC,
      totalTransactions: earnings.totalTransactions,
      generatedAt: new Date().toISOString(),
    };
  }
}

/**
 * A downloadable tax receipt issued to a backer for a contribution to a
 * campaign registered as charitable / non-profit (issue #1233).
 */
export interface TaxReceipt {
  /** Unique receipt identifier. */
  receiptId: string;
  /** Campaign the contribution was made to. */
  campaignId: string;
  /** Stellar-wallet public key of the backer (G…/C…). */
  backerAddress: string;
  /** Contribution amount in integer USDC units (e.g. "1000" = 1,000 USDC). */
  amount: string;
  /** Token the contribution was made in, e.g. "USDC". */
  token: string;
  /** Calendar tax year the receipt applies to, e.g. 2025. */
  taxYear: number;
  /** URL the backer can use to download the receipt PDF. */
  receiptUrl: string;
  /** ISO 8601 timestamp of when the receipt was issued. */
  issuedAt: string;
}

/** GraphQL endpoint used to fetch backer tax receipts. */
const TAX_RECEIPTS_GRAPHQL_URL =
  process.env.TAX_RECEIPTS_GRAPHQL_URL ?? "http://localhost:4000/graphql";

const LIST_TAX_RECEIPTS_QUERY = `
  query ListTaxReceipts($backerAddress: String!) {
    taxReceipts(backerAddress: $backerAddress) {
      receiptId
      campaignId
      backerAddress
      amount
      token
      taxYear
      receiptUrl
      issuedAt
    }
  }
`;

const GET_TAX_RECEIPT_QUERY = `
  query GetTaxReceipt($backerAddress: String!, $receiptId: String!) {
    taxReceipt(backerAddress: $backerAddress, receiptId: $receiptId) {
      receiptId
      campaignId
      backerAddress
      amount
      token
      taxYear
      receiptUrl
      issuedAt
    }
  }
`;

async function queryTaxReceipts<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(TAX_RECEIPTS_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Tax receipt request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors && payload.errors.length > 0) {
    const message = payload.errors.map((error) => error.message ?? "unknown error").join("; ");
    throw new Error(`Tax receipt request failed: ${message}`);
  }

  if (!payload.data) {
    throw new Error("Tax receipt request returned no data");
  }

  return payload.data;
}

/**
 * Client for fetching the tax receipts issued to a backer for contributions to
 * charitable / non-profit campaigns.
 */
export class TaxReceiptSDK {
  /** List all tax receipts issued to the given backer. */
  async listReceipts(backerAddress: string): Promise<TaxReceipt[]> {
    const data = await queryTaxReceipts<{ taxReceipts: TaxReceipt[] }>(
      LIST_TAX_RECEIPTS_QUERY,
      { backerAddress },
    );
    return data.taxReceipts ?? [];
  }

  /** Fetch a single tax receipt for the given backer, or `null` if not found. */
  async getReceipt(backerAddress: string, receiptId: string): Promise<TaxReceipt | null> {
    const data = await queryTaxReceipts<{ taxReceipt: TaxReceipt | null }>(
      GET_TAX_RECEIPT_QUERY,
      { backerAddress, receiptId },
    );
    return data.taxReceipt ?? null;
  }
}