/**
 * Tax Document Service — issue #792
 *
 * Auto-generates tax documents for campaign creators based on the funding
 * they received in a given tax year. Supports:
 *   - `us-1099-nec`   — IRS 1099-NEC (nonemployee compensation) for US creators
 *   - `eu-vat-oss`    — EU VAT OSS annual summary for EU creators
 *   - `earnings-statement` — generic annual earnings statement for other jurisdictions
 *
 * Funding "received" is derived from the sponsorship ledger on the platform's
 * campaign data source: every sponsor payment a creator earned on their
 * campaigns during the tax year (UTC). Amounts are integer USDC strings, the
 * same convention used across the campaign data model.
 *
 * Dependencies:
 *   - pdf-lib — pure-JS PDF construction, works in Node and Edge runtime
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import {
  getCampaignDataSource,
  type CampaignDataSource,
  type CampaignRecord,
} from "./campaign.service";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaxDocumentType = "us-1099-nec" | "eu-vat-oss" | "earnings-statement";
export type TaxJurisdiction = "US" | "EU" | "OTHER";

/** A single funding event received by a campaign creator. */
export interface CreatorEarningsTransaction {
  /** Gross amount in integer USDC units (e.g. "1000" = 1,000 USDC). */
  amount: string;
  /** Unix timestamp (ms) of the sponsor payment. */
  timestamp: number;
  /** Reference like `${campaignId}:${sponsorId}`. */
  reference: string;
}

/** Input payload for generating a tax-document PDF. */
export interface TaxDocumentInput {
  /** Creator's Stellar wallet public key (G…/C…). */
  creatorId: string;
  /** Calendar tax year, e.g. 2025. */
  taxYear: number;
  /** Which tax form / jurisdiction to render. */
  documentType: TaxDocumentType;
  /** Gross earnings for the year, formatted e.g. "12500.00". */
  grossEarningsUSDC: string;
  /** Number of funding events counted in the year. */
  totalTransactions: number;
  /** Optional legal/display name of the creator. */
  creatorName?: string;
  /** Optional tax identifier (EIN / VAT / national ID). */
  taxId?: string;
}

/** Typed result from the tax document service. */
export interface TaxDocumentResult {
  /** Raw PDF bytes ready to be streamed to the client. */
  pdfBytes: Uint8Array;
  /** Unique document identifier (UUID v4). */
  documentId: string;
  /** ISO 8601 timestamp of generation. */
  generatedAt: string;
}

/** Errors thrown by the tax document service. */
export class TaxDocumentError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_INPUT" | "PDF_GENERATION_FAILED",
  ) {
    super(message);
    this.name = "TaxDocumentError";
    Object.setPrototypeOf(this, TaxDocumentError.prototype);
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const SUPPORTED_TAX_DOCUMENT_TYPES: ReadonlyArray<{
  documentType: TaxDocumentType;
  jurisdiction: TaxJurisdiction;
  label: string;
  description: string;
}> = [
  {
    documentType: "us-1099-nec",
    jurisdiction: "US",
    label: "IRS 1099-NEC",
    description: "Nonemployee compensation — US creators",
  },
  {
    documentType: "eu-vat-oss",
    jurisdiction: "EU",
    label: "EU VAT OSS Annual Summary",
    description: "EU VAT / OSS reporting — EU creators",
  },
  {
    documentType: "earnings-statement",
    jurisdiction: "OTHER",
    label: "Annual Earnings Statement",
    description: "Generic annual earnings statement — other jurisdictions",
  },
];

/** Map a tax jurisdiction to the matching tax-document type. */
export function selectTaxDocumentType(jurisdiction: TaxJurisdiction): TaxDocumentType {
  switch (jurisdiction) {
    case "US":
      return "us-1099-nec";
    case "EU":
      return "eu-vat-oss";
    case "OTHER":
      return "earnings-statement";
  }
}

/** Format an integer USDC amount (whole units) with two decimals. */
export function formatUnitsAsUsdc(units: bigint): string {
  return `${units}.00`;
}

// ── Earnings aggregation ──────────────────────────────────────────────────────

/** Resolve a creator's funding received during a tax year (UTC). */
export async function loadCreatorTaxYearEarnings(
  creatorId: string,
  taxYear: number,
  dataSource: CampaignDataSource = getCampaignDataSource(),
): Promise<{
  transactions: CreatorEarningsTransaction[];
  grossEarningsUSDC: string;
  totalTransactions: number;
}> {
  const campaigns = (await dataSource.getCampaigns()).filter(
    (campaign: CampaignRecord) => campaign.creator === creatorId,
  );

  const transactions: CreatorEarningsTransaction[] = [];
  let total = 0n;

  for (const campaign of campaigns) {
    for (const sponsor of campaign.sponsors ?? []) {
      if (new Date(sponsor.sponsoredAt).getUTCFullYear() !== taxYear) continue;
      const amount = sponsor.amount ?? "0";
      transactions.push({
        amount,
        timestamp: sponsor.sponsoredAt,
        reference: `${campaign.id}:${sponsor.id}`,
      });
      total += BigInt(/^\d+$/.test(amount) ? amount : "0");
    }
  }

  return {
    transactions,
    grossEarningsUSDC: formatUnitsAsUsdc(total),
    totalTransactions: transactions.length,
  };
}

// ── PDF generation ────────────────────────────────────────────────────────────

const PAGE_WIDTH = 595.28;  // A4 width  (pt)
const PAGE_HEIGHT = 841.89; // A4 height (pt)
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLOR_PRIMARY = rgb(0.18, 0.42, 0.87);   // #2D6BDE  Fundable blue
const COLOR_DARK = rgb(0.1, 0.1, 0.1);         // near-black
const COLOR_MUTED = rgb(0.45, 0.45, 0.45);     // mid-grey
const COLOR_BORDER = rgb(0.85, 0.87, 0.91);    // light grey
const COLOR_WHITE = rgb(1, 1, 1);

/** Simple UUID v4 — crypto.randomUUID() is available in Node 14.17+ and Edge. */
function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function drawHRule(page: PDFPage, y: number, color = COLOR_BORDER, thickness = 0.5): void {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness,
    color,
  });
}

function drawLabelValue(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  fontBold: PDFFont,
  fontRegular: PDFFont,
): number {
  page.drawText(label.toUpperCase(), {
    x, y, size: 7.5, font: fontRegular, color: COLOR_MUTED,
  });
  const valueY = y - 14;
  page.drawText(value || "—", {
    x, y: valueY, size: 9.5, font: fontBold, color: COLOR_DARK,
  });
  return valueY - 16;
}

function drawBox(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  page.drawRectangle({
    x, y, width, height,
    borderColor: COLOR_BORDER,
    borderWidth: 1,
  });
}

function drawTaxFormTitle(
  page: PDFPage,
  fontBold: PDFFont,
  title: string,
  subtitle: string,
  y: number,
): void {
  const width = fontBold.widthOfTextAtSize(title, 22);
  page.drawText(title, {
    x: PAGE_WIDTH / 2 - width / 2,
    y,
    size: 22,
    font: fontBold,
    color: COLOR_DARK,
  });
  page.drawText(subtitle, {
    x: PAGE_WIDTH / 2 - fontBold.widthOfTextAtSize(subtitle, 9) / 2,
    y: y - 16,
    size: 9,
    font: fontBold,
    color: COLOR_MUTED,
  });
}

/**
 * Build the PDF document for the selected tax form.
 * Returns raw `Uint8Array` bytes; stream with `Content-Type: application/pdf`.
 */
export async function buildTaxFormPdf(input: TaxDocumentInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Fundable ${input.documentType}`);
  pdfDoc.setAuthor("Fundable Protocol");
  pdfDoc.setSubject(`${input.documentType} — tax year ${input.taxYear}`);
  pdfDoc.setCreationDate(new Date());

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // ── Header band ────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: 0, y: PAGE_HEIGHT - 72, width: PAGE_WIDTH, height: 72, color: COLOR_PRIMARY,
  });
  page.drawText("Fundable Protocol", {
    x: MARGIN, y: PAGE_HEIGHT - 44, size: 20, font: fontBold, color: COLOR_WHITE,
  });
  const badgeLabel = `TAX YEAR ${input.taxYear}`;
  const badgeWidth = fontBold.widthOfTextAtSize(badgeLabel, 9);
  page.drawText(badgeLabel, {
    x: PAGE_WIDTH - MARGIN - badgeWidth, y: PAGE_HEIGHT - 30, size: 9,
    font: fontBold, color: rgb(0.82, 0.89, 1),
  });

  let cursor = PAGE_HEIGHT - 72 - 96;

  const creatorName = input.creatorName ?? input.creatorId;
  const gross = input.grossEarningsUSDC || "0.00";

  if (input.documentType === "us-1099-nec") {
    drawTaxFormTitle(page, fontBold, "1099-NEC", "NONEMPLOYEE COMPENSATION", cursor);
    cursor -= 56;
    drawHRule(page, cursor, COLOR_PRIMARY, 1.2);
    cursor -= 24;

    cursor = drawLabelValue(page, "Payer", "Fundable Protocol", MARGIN, cursor, fontBold, fontRegular);
    drawLabelValue(page, "Creator (Recipient)", creatorName, MARGIN + CONTENT_WIDTH / 2, cursor + 34, fontBold, fontRegular);
    cursor -= 20;
    drawLabelValue(page, "Recipient ID", input.creatorId, MARGIN, cursor, fontBold, fontRegular);
    drawLabelValue(page, "Recipient TIN", input.taxId ?? "N/A", MARGIN + CONTENT_WIDTH / 2, cursor + 32, fontBold, fontRegular);
    cursor -= 28;
    drawHRule(page, cursor);
    cursor -= 24;

    // IRS boxes
    drawBox(page, MARGIN, cursor - 44, CONTENT_WIDTH, 54);
    page.drawText("1  Nonemployee compensation", { x: MARGIN + 10, y: cursor - 14, size: 9, font: fontBold, color: COLOR_DARK });
    page.drawText(gross, { x: MARGIN + 10, y: cursor - 30, size: 13, font: fontBold, color: COLOR_PRIMARY });
    cursor -= 58;
    drawBox(page, MARGIN, cursor - 44, CONTENT_WIDTH, 54);
    page.drawText("4  Federal income tax withheld", { x: MARGIN + 10, y: cursor - 14, size: 9, font: fontBold, color: COLOR_DARK });
    page.drawText("0.00", { x: MARGIN + 10, y: cursor - 30, size: 13, font: fontBold, color: COLOR_PRIMARY });
    cursor -= 72;
    drawHRule(page, cursor, COLOR_PRIMARY, 1.2);
    cursor -= 20;
    page.drawText("Copy for recipient — for informational purposes, not a substitute for the Copy A filed with the IRS.", {
      x: MARGIN, y: cursor, size: 7.5, font: fontOblique, color: COLOR_MUTED,
    });
  } else if (input.documentType === "eu-vat-oss") {
    drawTaxFormTitle(page, fontBold, "EU VAT OSS ANNUAL SUMMARY", "VAT / OSS 2022+", cursor);
    cursor -= 56;
    drawHRule(page, cursor, COLOR_PRIMARY, 1.2);
    cursor -= 24;

    cursor = drawLabelValue(page, "Supplier (Creator)", creatorName, MARGIN, cursor, fontBold, fontRegular);
    drawLabelValue(page, "Supplier VAT ID", input.taxId ?? "N/A", MARGIN + CONTENT_WIDTH / 2, cursor + 34, fontBold, fontRegular);
    cursor -= 20;
    drawLabelValue(page, "Period", `Jan 1 — Dec 31, ${input.taxYear}`, MARGIN, cursor, fontBold, fontRegular);
    drawLabelValue(page, "Reporting scheme", "OSS / EU VAT", MARGIN + CONTENT_WIDTH / 2, cursor + 32, fontBold, fontRegular);
    cursor -= 28;
    drawHRule(page, cursor);
    cursor -= 24;

    drawBox(page, MARGIN, cursor - 44, CONTENT_WIDTH, 54);
    page.drawText("Total value of supplies into the EU (gross)", { x: MARGIN + 10, y: cursor - 14, size: 9, font: fontBold, color: COLOR_DARK });
    page.drawText(`${gross} USDC`, { x: MARGIN + 10, y: cursor - 30, size: 13, font: fontBold, color: COLOR_PRIMARY });
    cursor -= 58;
    drawBox(page, MARGIN, cursor - 44, CONTENT_WIDTH, 54);
    page.drawText("Number of transactions", { x: MARGIN + 10, y: cursor - 14, size: 9, font: fontBold, color: COLOR_DARK });
    page.drawText(String(input.totalTransactions), { x: MARGIN + 10, y: cursor - 30, size: 13, font: fontBold, color: COLOR_PRIMARY });
    cursor -= 72;
    drawHRule(page, cursor, COLOR_PRIMARY, 1.2);
    cursor -= 20;
    page.drawText(
      "This summary reflects platform-measured funding; it does not replace the VAT/OES return required by your tax authority.",
      { x: MARGIN, y: cursor, size: 7.5, font: fontOblique, color: COLOR_MUTED },
    );
  } else {
    drawTaxFormTitle(page, fontBold, "ANNUAL EARNINGS STATEMENT", "Other tax jurisdictions", cursor);
    cursor -= 56;
    drawHRule(page, cursor, COLOR_PRIMARY, 1.2);
    cursor -= 24;

    cursor = drawLabelValue(page, "Creator", creatorName, MARGIN, cursor, fontBold, fontRegular);
    drawLabelValue(page, "Creator ID", input.creatorId, MARGIN + CONTENT_WIDTH / 2, cursor + 34, fontBold, fontRegular);
    cursor -= 20;
    drawLabelValue(page, "Period", `Jan 1 — Dec 31, ${input.taxYear}`, MARGIN, cursor, fontBold, fontRegular);
    drawLabelValue(page, "Tax identifier", input.taxId ?? "N/A", MARGIN + CONTENT_WIDTH / 2, cursor + 32, fontBold, fontRegular);
    cursor -= 28;
    drawHRule(page, cursor);
    cursor -= 24;

    drawBox(page, MARGIN, cursor - 44, CONTENT_WIDTH, 54);
    page.drawText("Gross earnings (funding received)", { x: MARGIN + 10, y: cursor - 14, size: 9, font: fontBold, color: COLOR_DARK });
    page.drawText(`${gross} USDC`, { x: MARGIN + 10, y: cursor - 30, size: 13, font: fontBold, color: COLOR_PRIMARY });
    cursor -= 58;
    drawBox(page, MARGIN, cursor - 44, CONTENT_WIDTH, 54);
    page.drawText("Number of transactions", { x: MARGIN + 10, y: cursor - 14, size: 9, font: fontBold, color: COLOR_DARK });
    page.drawText(String(input.totalTransactions), { x: MARGIN + 10, y: cursor - 30, size: 13, font: fontBold, color: COLOR_PRIMARY });
    cursor -= 72;
    drawHRule(page, cursor, COLOR_PRIMARY, 1.2);
    cursor -= 20;
    page.drawText(
      "Prepared automatically by Fundable Protocol from confirmed funding received on the platform.",
      { x: MARGIN, y: cursor, size: 7.5, font: fontOblique, color: COLOR_MUTED },
    );
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: 0, y: 0, width: PAGE_WIDTH, height: 36, color: rgb(0.96, 0.97, 0.99),
  });
  page.drawText(
    "Generated by Fundable Protocol. https://fundable.network",
    { x: MARGIN, y: 14, size: 6.5, font: fontOblique, color: COLOR_MUTED },
  );
  page.drawText(`Document ID and generator timestamp appear on the payer copy.`, {
    x: MARGIN, y: 6, size: 6, font: fontRegular, color: COLOR_MUTED,
  });

  return pdfDoc.save();
}

// ── Top-level entry point ─────────────────────────────────────────────────────

export function validateTaxDocumentInput(input: TaxDocumentInput): void {
  if (!input.creatorId?.trim()) {
    throw new TaxDocumentError("creatorId is required", "INVALID_INPUT");
  }
  if (
    !Number.isInteger(input.taxYear) ||
    input.taxYear < 2000 ||
    input.taxYear > 2100
  ) {
    throw new TaxDocumentError("taxYear must be a valid calendar year", "INVALID_INPUT");
  }
  if (
    !SUPPORTED_TAX_DOCUMENT_TYPES.some(
      (form) => form.documentType === input.documentType,
    )
  ) {
    throw new TaxDocumentError(`Unsupported document type: ${input.documentType}`, "INVALID_INPUT");
  }
  if (typeof input.totalTransactions !== "number" || input.totalTransactions < 0) {
    throw new TaxDocumentError("totalTransactions must be a non-negative number", "INVALID_INPUT");
  }
}

/**
 * Validate then build a tax-document PDF for a campaign creator.
 * @throws `TaxDocumentError` on invalid input or generation failure.
 */
export async function generateTaxDocument(
  input: TaxDocumentInput,
): Promise<TaxDocumentResult> {
  validateTaxDocumentInput(input);

  const documentId = uuid();
  const generatedAt = new Date().toISOString();

  try {
    const pdfBytes = await buildTaxFormPdf(input);
    return { pdfBytes, documentId, generatedAt };
  } catch (err) {
    if (err instanceof TaxDocumentError) throw err;
    throw new TaxDocumentError(
      `PDF generation failed: ${err instanceof Error ? err.message : String(err)}`,
      "PDF_GENERATION_FAILED",
    );
  }
}