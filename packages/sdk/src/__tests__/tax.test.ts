import { describe, it, expect } from "vitest";
import {
  computeAnnualEarnings,
  formatUsdcFromInteger,
  selectTaxForm,
  TaxReportingSDK,
  type EarningsTransaction,
} from "../tax";

function tx(amount: string, timestamp: number, reference?: string): EarningsTransaction {
  return { amount, timestamp, reference };
}

const ts = (iso: string): number => Date.parse(iso);

describe("computeAnnualEarnings", () => {
  it("sums integer USDC units into a two-decimal report", () => {
    const earnings = computeAnnualEarnings(
      [
        tx("1000", ts("2025-03-01T12:00:00Z")),
        tx("2500", ts("2025-07-20T08:30:00Z")),
      ],
      2025,
    );

    expect(earnings.grossEarningsUSDC).toBe("3500.00");
    expect(earnings.totalTransactions).toBe(2);
  });

  it("ignores transactions outside the tax year", () => {
    const earnings = computeAnnualEarnings(
      [
        tx("1000", ts("2024-12-31T23:59:59Z")),
        tx("2500", ts("2025-01-01T00:00:00Z")),
        tx("500", ts("2026-01-01T00:00:00Z")),
      ],
      2025,
    );

    expect(earnings.grossEarningsUSDC).toBe("2500.00");
    expect(earnings.totalTransactions).toBe(1);
  });

  it("treats missing amounts as zero but still counts the transaction", () => {
    const earnings = computeAnnualEarnings([tx("", ts("2025-05-05T00:00:00Z"))], 2025);

    expect(earnings.grossEarningsUSDC).toBe("0.00");
    expect(earnings.totalTransactions).toBe(1);
  });

  it("returns zeroed totals for an empty ledger", () => {
    const earnings = computeAnnualEarnings([], 2025);

    expect(earnings.grossEarningsUSDC).toBe("0.00");
    expect(earnings.totalTransactions).toBe(0);
  });

  it("handles large amounts without precision loss", () => {
    const earnings = computeAnnualEarnings(
      [tx("9007199254740993", ts("2025-02-02T00:00:00Z"))],
      2025,
    );

    expect(earnings.totalTransactions).toBe(1);
    expect(earnings.grossEarningsUSDC).toBe("9007199254740993.00");
  });
});

describe("formatUsdcFromInteger", () => {
  it("always renders two decimals", () => {
    expect(formatUsdcFromInteger(12500n)).toBe("12500.00");
    expect(formatUsdcFromInteger(5n)).toBe("5.00");
    expect(formatUsdcFromInteger(0n)).toBe("0.00");
  });
});

describe("selectTaxForm", () => {
  it("maps each jurisdiction to a tax-document type", () => {
    expect(selectTaxForm("US")).toBe("us-1099-nec");
    expect(selectTaxForm("EU")).toBe("eu-vat-oss");
    expect(selectTaxForm("OTHER")).toBe("earnings-statement");
  });
});

describe("TaxReportingSDK", () => {
  it("compiles a 1099 record from the provided transactions", async () => {
    const sdk = new TaxReportingSDK("https://rpc.example");
    const record = await sdk.getAnnualEarnings(
      { creatorId: "GABC", taxYear: 2025 },
      [
        tx("4000", ts("2025-04-01T00:00:00Z")),
        tx("1100", ts("2025-11-30T00:00:00Z")),
        tx("99999", ts("2024-06-01T00:00:00Z")),
      ],
    );

    expect(record.creatorId).toBe("GABC");
    expect(record.taxYear).toBe(2025);
    expect(record.grossEarningsUSDC).toBe("5100.00");
    expect(record.totalTransactions).toBe(2);
    expect(record.generatedAt).toEqual(expect.any(String));
  });

  it("reports zeros instead of fabricating earnings when no data is passed", async () => {
    const sdk = new TaxReportingSDK("https://rpc.example");
    const record = await sdk.getAnnualEarnings({ creatorId: "GXYZ", taxYear: 2025 });

    expect(record.grossEarningsUSDC).toBe("0.00");
    expect(record.totalTransactions).toBe(0);
  });
});