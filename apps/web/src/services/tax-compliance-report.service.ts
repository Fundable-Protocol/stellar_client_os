import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { BackerContribution } from "@/types/campaign-backers";
import { backersService } from "./campaign-backers.service";
import {
  getCampaignDataSource,
  type CampaignDataSource,
  type CampaignRecord,
  type SponsorRecord,
} from "./campaign.service";

export type TaxReportRole = "creator" | "backer";
export type TaxReportFormat = "csv" | "pdf";

export interface TaxReportRow {
  campaign: string;
  date: string;
  transactionHash: string;
  tokenAmount: string;
  token: string;
  usdEquivalent: string;
  exchangeRate: string;
  counterparty: string;
  classification: string;
  platformFee: string;
  milestonePayout: string;
  rewardReceived: string;
}

export interface TaxReport {
  role: TaxReportRole;
  walletAddress: string;
  taxYear: number;
  transactions: TaxReportRow[];
  grossByToken: Array<{ token: string; amount: string }>;
}

function sameAddress(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function toMillis(timestamp: number): number {
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function tokenAmount(value: string): bigint | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,7})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
}

function formatTokenAmount(value: bigint): string {
  const whole = value / 10_000_000n;
  const fraction = (value % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function contributionFor(
  campaignId: string,
  sponsor: SponsorRecord,
  contributions: BackerContribution[],
): BackerContribution | undefined {
  return contributions.find((entry) =>
    sameAddress(entry.backerAddress, sponsor.address) &&
    entry.campaignId === campaignId &&
    toMillis(entry.contributedAt) === toMillis(sponsor.sponsoredAt),
  );
}

function buildRow(
  campaign: CampaignRecord,
  sponsor: SponsorRecord,
  role: TaxReportRole,
  contribution?: BackerContribution,
): TaxReportRow {
  const isCreator = role === "creator";
  return {
    campaign: campaign.name,
    date: new Date(toMillis(sponsor.sponsoredAt)).toISOString(),
    transactionHash: contribution?.txHash ?? "Not recorded",
    tokenAmount: contribution?.grossAmount ?? sponsor.amount,
    token: (contribution?.token ?? sponsor.token).toUpperCase(),
    usdEquivalent: "Not recorded",
    exchangeRate: "Not recorded",
    counterparty: isCreator ? sponsor.address : campaign.creator,
    classification: isCreator ? "Campaign contribution received" : "Pledge / donation; reward status unknown",
    platformFee: "Not recorded",
    milestonePayout: "Not recorded",
    rewardReceived: "Not recorded",
  };
}

export async function buildTaxComplianceReport(
  walletAddress: string,
  taxYear: number,
  role: TaxReportRole,
  dataSource: CampaignDataSource = getCampaignDataSource(),
): Promise<TaxReport> {
  const normalizedAddress = walletAddress.trim();
  if (!normalizedAddress) throw new Error("Wallet address is required");
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    throw new Error("Tax year must be between 2000 and 2100");
  }

  const campaigns = await dataSource.getCampaigns();
  const transactions: TaxReportRow[] = [];
  const grossTotals = new Map<string, bigint>();

  for (const campaign of campaigns) {
    if (role === "creator" && !sameAddress(campaign.creator, normalizedAddress)) continue;
    const contributions = backersService.getContributions(campaign.id);
    for (const sponsor of campaign.sponsors ?? []) {
      if (role === "backer" && !sameAddress(sponsor.address, normalizedAddress)) continue;
      if (new Date(toMillis(sponsor.sponsoredAt)).getUTCFullYear() !== taxYear) continue;

      const contribution = contributionFor(campaign.id, sponsor, contributions);
      const row = buildRow(campaign, sponsor, role, contribution);
      transactions.push(row);
      const amount = tokenAmount(row.tokenAmount);
      if (amount !== null) {
        grossTotals.set(row.token, (grossTotals.get(row.token) ?? 0n) + amount);
      }
    }
  }

  transactions.sort((left, right) => left.date.localeCompare(right.date));
  return {
    role,
    walletAddress: normalizedAddress,
    taxYear,
    transactions,
    grossByToken: Array.from(grossTotals, ([token, amount]) => ({
      token,
      amount: formatTokenAmount(amount),
    })).sort((left, right) => left.token.localeCompare(right.token)),
  };
}

const CSV_HEADERS = [
  "Campaign",
  "Date (UTC)",
  "Transaction hash",
  "Token amount",
  "Token",
  "USD equivalent at transaction",
  "Exchange rate (USD per token)",
  "Counterparty",
  "Classification",
  "Platform fee",
  "Milestone payout",
  "Reward received",
];

function csvCell(value: string): string {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function buildTaxComplianceCsv(report: TaxReport): string {
  const summaryRows = report.grossByToken.map(({ token, amount }) => [
    "Annual gross total",
    "",
    "",
    amount,
    token,
    "",
    "",
    "",
    "",
    "Not recorded",
    "Not recorded",
    "Not recorded",
  ]);
  const rows = report.transactions.map((row) => [
    row.campaign,
    row.date,
    row.transactionHash,
    row.tokenAmount,
    row.token,
    row.usdEquivalent,
    row.exchangeRate,
    row.counterparty,
    row.classification,
    row.platformFee,
    row.milestonePayout,
    row.rewardReceived,
  ]);
  return [
    `Tax year ${report.taxYear} ${report.role} report`,
    `Wallet,${csvCell(report.walletAddress)}`,
    "",
    CSV_HEADERS.map(csvCell).join(","),
    ...summaryRows.map((row) => row.map(csvCell).join(",")),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");
}

function pdfText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").normalize("NFKD").replace(/[^\x20-\x7E]/g, "?").slice(0, 120);
}

function pdfCell(value: string, maxLength: number): string {
  const text = pdfText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

export async function buildTaxCompliancePdf(report: TaxReport): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`Annual tax report ${report.taxYear}`);
  document.setAuthor("Fundable Protocol");
  document.setSubject(`${report.role} transaction summary for ${report.taxYear}`);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 42;
  const columns = [
    { title: "DATE", width: 58, value: (row: TaxReportRow) => row.date.slice(0, 10) },
    { title: "CAMPAIGN", width: 118, value: (row: TaxReportRow) => row.campaign },
    { title: "AMOUNT", width: 78, value: (row: TaxReportRow) => `${row.tokenAmount} ${row.token}` },
    { title: "USD VALUE", width: 78, value: (row: TaxReportRow) => row.usdEquivalent },
    { title: "COUNTERPARTY", width: 179, value: (row: TaxReportRow) => row.counterparty },
  ];

  let page = document.addPage(pageSize);
  let y = pageSize[1] - margin;
  const drawHeader = () => {
    page.drawText("ANNUAL TAX COMPLIANCE REPORT", {
      x: margin, y, size: 17, font: bold, color: rgb(0.12, 0.24, 0.42),
    });
    y -= 24;
    page.drawText(`${report.taxYear} | ${report.role.toUpperCase()} | ${pdfText(report.walletAddress)}`, {
      x: margin, y, size: 9, font, color: rgb(0.35, 0.38, 0.42),
    });
    y -= 24;
    page.drawText("GROSS AMOUNTS RECORDED", { x: margin, y, size: 9, font: bold });
    y -= 16;
    page.drawText(
      report.grossByToken.length
        ? report.grossByToken.map(({ token, amount }) => `${amount} ${token}`).join("   |   ")
        : "No contributions recorded",
      { x: margin, y, size: 10, font: bold, color: rgb(0.12, 0.42, 0.34) },
    );
    y -= 30;
    page.drawText("PLATFORM FEES AND MILESTONE PAYOUTS: Not recorded in the available transaction ledger.", {
      x: margin, y, size: 8, font, color: rgb(0.35, 0.38, 0.42),
    });
    y -= 14;
    page.drawText("Transaction-time USD values and exchange rates: Not recorded in the available transaction ledger.", {
      x: margin, y, size: 8, font, color: rgb(0.35, 0.38, 0.42),
    });
    y -= 28;
    let x = margin;
    for (const column of columns) {
      page.drawText(column.title, { x, y, size: 7, font: bold, color: rgb(0.35, 0.38, 0.42) });
      x += column.width;
    }
    y -= 14;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageSize[0] - margin, y },
      thickness: 0.7,
      color: rgb(0.78, 0.8, 0.83),
    });
    y -= 15;
  };

  drawHeader();
  for (const row of report.transactions) {
    if (y < margin + 42) {
      page = document.addPage(pageSize);
      y = pageSize[1] - margin;
      drawHeader();
    }
    let x = margin;
    for (const column of columns) {
      page.drawText(pdfCell(column.value(row), Math.floor(column.width / 3.7)), {
        x, y, size: 7, font, maxWidth: column.width - 6,
      });
      x += column.width;
    }
    y -= 13;
    const hash = pdfText(`Transaction hash: ${row.transactionHash}`);
    page.drawText(hash, { x: margin, y, size: 7, font, maxWidth: pageSize[0] - margin * 2 });
    y -= 17;
  }

  const footnote = "This report summarizes platform-recorded data and is not tax advice. Verify all details with your accountant.";
  if (y < margin + 30) {
    page = document.addPage(pageSize);
    y = pageSize[1] - margin;
  }
  page.drawText(footnote, {
    x: margin, y: Math.max(y - 12, margin), size: 8, font, color: rgb(0.35, 0.38, 0.42),
    maxWidth: pageSize[0] - margin * 2,
  });
  return document.save();
}
