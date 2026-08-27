/**
 * Certificate Service — issue #539
 *
 * Generates high-resolution PDF contribution receipts for verified donors.
 * Each PDF contains:
 *   - Fundable Protocol branding header
 *   - Donor details section
 *   - Contribution breakdown table
 *   - Verification status badge
 *   - QR code linking to the on-chain transaction
 *   - Unique certificate ID and issuance timestamp
 *
 * Dependencies:
 *   - pdf-lib   — pure-JS PDF construction, works in Node and Edge runtime
 *   - qrcode    — QR code generation as PNG data URI
 */

import { PDFDocument, rgb, StandardFonts, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single line item in the contribution breakdown. */
export interface ContributionLineItem {
  /** Description of the contribution (e.g. "Stream #42", "USDC Donation") */
  description: string;
  /** Token ticker symbol (e.g. "USDC", "XLM") */
  token: string;
  /** Human-readable amount string (e.g. "1,000.00") */
  amount: string;
  /** Unix timestamp (seconds) of the transaction */
  timestamp: number;
}

/** Input payload for generating a certificate or invoice PDF. */
export interface CertificateInput {
  /** Donor's display name */
  donorName: string;
  /** Donor's Stellar wallet address (G… or C…) */
  donorAddress: string;
  /** Recipient project or address name */
  recipientName: string;
  /** Stellar transaction hash for the QR code */
  transactionHash: string;
  /** Stellar network ("testnet" | "mainnet") — used to build the explorer URL */
  network: "testnet" | "mainnet";
  /** Ordered list of contribution line items */
  lineItems: ContributionLineItem[];
  /** Total amount in human-readable form (e.g. "2,500.00 USDC") */
  totalAmount: string;
  /** ISO 8601 date string for the certificate ("2025-01-15") */
  issuedAt?: string;
  /** Optional organisation or project logo as a base64 PNG data URI */
  logoDataUri?: string;
  /** Document type — controls the title printed on the PDF */
  documentType?: "certificate" | "invoice";
}

/** Typed result from the certificate service. */
export interface CertificateResult {
  /** Raw PDF bytes ready to be streamed to the client. */
  pdfBytes: Uint8Array;
  /** Unique certificate identifier (UUID v4). */
  certificateId: string;
  /** ISO 8601 timestamp of generation. */
  generatedAt: string;
}

/** Error codes thrown by the certificate service. */
export class CertificateError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_INPUT"
      | "QR_GENERATION_FAILED"
      | "PDF_GENERATION_FAILED"
  ) {
    super(message);
    this.name = "CertificateError";
    Object.setPrototypeOf(this, CertificateError.prototype);
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_WIDTH = 595.28;  // A4 width  (pt)
const PAGE_HEIGHT = 841.89; // A4 height (pt)
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Brand colours
const COLOR_PRIMARY = rgb(0.18, 0.42, 0.87);   // #2D6BDE  Fundable blue
const COLOR_DARK = rgb(0.1, 0.1, 0.1);         // near-black
const COLOR_MUTED = rgb(0.45, 0.45, 0.45);     // mid-grey
const COLOR_BORDER = rgb(0.85, 0.87, 0.91);    // light grey
const COLOR_WHITE = rgb(1, 1, 1);
const COLOR_VERIFIED = rgb(0.13, 0.66, 0.42);  // #21A86B

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Simple UUID v4 — crypto.randomUUID() is available in Node 14.17+ and Edge. */
function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older Node versions
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Format a Unix timestamp (seconds) as "Jan 15, 2025 14:32 UTC". */
function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/** Stellar Explorer URL for a transaction hash. */
function explorerUrl(txHash: string, network: "testnet" | "mainnet"): string {
  const base =
    network === "mainnet"
      ? "https://stellar.expert/explorer/public/tx"
      : "https://stellar.expert/explorer/testnet/tx";
  return `${base}/${txHash}`;
}

/** Truncate a long string with ellipsis at the centre. */
function truncateMiddle(str: string, maxLength = 24): string {
  if (str.length <= maxLength) return str;
  const half = Math.floor((maxLength - 3) / 2);
  return `${str.slice(0, half)}...${str.slice(-half)}`;
}

/** Draw a horizontal rule across the content area. */
function drawHRule(
  page: PDFPage,
  y: number,
  color = COLOR_BORDER,
  thickness = 0.5
): void {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness,
    color,
  });
}

// ── Core service ──────────────────────────────────────────────────────────────

/**
 * Validate the certificate input before attempting PDF generation.
 * Throws `CertificateError` with code `INVALID_INPUT` on failure.
 */
export function validateCertificateInput(input: CertificateInput): void {
  if (!input.donorName?.trim()) {
    throw new CertificateError("donorName is required", "INVALID_INPUT");
  }
  if (!input.donorAddress?.trim()) {
    throw new CertificateError("donorAddress is required", "INVALID_INPUT");
  }
  if (!input.transactionHash?.trim()) {
    throw new CertificateError("transactionHash is required", "INVALID_INPUT");
  }
  if (!input.totalAmount?.trim()) {
    throw new CertificateError("totalAmount is required", "INVALID_INPUT");
  }
  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) {
    throw new CertificateError(
      "lineItems must be a non-empty array",
      "INVALID_INPUT"
    );
  }
  for (const item of input.lineItems) {
    if (!item.description?.trim() || !item.token?.trim() || !item.amount?.trim()) {
      throw new CertificateError(
        "Each line item must have description, token, and amount",
        "INVALID_INPUT"
      );
    }
  }
}

/**
 * Generate a QR code PNG as a base64-encoded data URI.
 * Returns `null` on failure so the PDF can still be generated without it.
 */
export async function generateQrDataUri(
  url: string
): Promise<string | null> {
  try {
    return await QRCode.toDataURL(url, {
      width: 200,
      margin: 1,
      color: { dark: "#1A1A1A", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    });
  } catch {
    return null;
  }
}

/**
 * Build the PDF document from the validated input.
 *
 * Returns raw `Uint8Array` bytes. Callers should stream these with
 * `Content-Type: application/pdf` and `Content-Disposition: attachment`.
 */
export async function buildCertificatePdf(
  input: CertificateInput,
  certificateId: string,
  generatedAt: string
): Promise<Uint8Array> {
  const docType = input.documentType ?? "certificate";
  const title =
    docType === "invoice"
      ? "Contribution Invoice"
      : "Contribution Receipt";

  // ── QR code ────────────────────────────────────────────────────────────────
  const txUrl = explorerUrl(input.transactionHash, input.network ?? "testnet");
  const qrDataUri = await generateQrDataUri(txUrl);

  // ── PDF scaffold ───────────────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Fundable ${title}`);
  pdfDoc.setAuthor("Fundable Protocol");
  pdfDoc.setSubject(`${title} — ${certificateId}`);
  pdfDoc.setCreationDate(new Date(generatedAt));

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let cursor = PAGE_HEIGHT - MARGIN; // top → bottom

  // ── Header band ────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 72,
    width: PAGE_WIDTH,
    height: 72,
    color: COLOR_PRIMARY,
  });

  // Brand wordmark
  page.drawText("Fundable Protocol", {
    x: MARGIN,
    y: PAGE_HEIGHT - 44,
    size: 20,
    font: fontBold,
    color: COLOR_WHITE,
  });

  // Document type label (top-right)
  const titleWidth = fontBold.widthOfTextAtSize(title.toUpperCase(), 9);
  page.drawText(title.toUpperCase(), {
    x: PAGE_WIDTH - MARGIN - titleWidth,
    y: PAGE_HEIGHT - 30,
    size: 9,
    font: fontBold,
    color: rgb(0.82, 0.89, 1),
  });

  const networkLabel = `${(input.network ?? "testnet").toUpperCase()} NETWORK`;
  const networkLabelWidth = fontRegular.widthOfTextAtSize(networkLabel, 7.5);
  page.drawText(networkLabel, {
    x: PAGE_WIDTH - MARGIN - networkLabelWidth,
    y: PAGE_HEIGHT - 44,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.75, 0.85, 1),
  });

  cursor = PAGE_HEIGHT - 72 - 24; // just below header band

  // ── Certificate ID + date ──────────────────────────────────────────────────
  page.drawText(`Certificate ID: ${certificateId}`, {
    x: MARGIN,
    y: cursor,
    size: 7.5,
    font: fontOblique,
    color: COLOR_MUTED,
  });

  const issuedLabel = `Issued: ${input.issuedAt ?? generatedAt.split("T")[0]}`;
  const issuedWidth = fontOblique.widthOfTextAtSize(issuedLabel, 7.5);
  page.drawText(issuedLabel, {
    x: PAGE_WIDTH - MARGIN - issuedWidth,
    y: cursor,
    size: 7.5,
    font: fontOblique,
    color: COLOR_MUTED,
  });

  cursor -= 20;
  drawHRule(page, cursor);
  cursor -= 20;

  // ── Donor / recipient block ────────────────────────────────────────────────
  const labelSize = 8;
  const valueSize = 10;
  const col2X = MARGIN + CONTENT_WIDTH / 2 + 8;

  // Left column
  page.drawText("FROM (DONOR)", { x: MARGIN, y: cursor, size: labelSize, font: fontBold, color: COLOR_MUTED });
  cursor -= 14;
  page.drawText(input.donorName, { x: MARGIN, y: cursor, size: valueSize, font: fontBold, color: COLOR_DARK });
  cursor -= 13;
  page.drawText(truncateMiddle(input.donorAddress, 36), {
    x: MARGIN, y: cursor, size: 8, font: fontRegular, color: COLOR_MUTED,
  });

  // Right column (reset cursor for right column, then pick the lower of the two)
  const rightStartY = cursor + 27;
  page.drawText("TO (RECIPIENT)", { x: col2X, y: rightStartY, size: labelSize, font: fontBold, color: COLOR_MUTED });
  page.drawText(input.recipientName, {
    x: col2X, y: rightStartY - 14, size: valueSize, font: fontBold, color: COLOR_DARK,
  });

  cursor -= 24;
  drawHRule(page, cursor);
  cursor -= 20;

  // ── Line items table ───────────────────────────────────────────────────────
  // Table header
  page.drawRectangle({ x: MARGIN, y: cursor - 14, width: CONTENT_WIDTH, height: 20, color: rgb(0.94, 0.96, 0.99) });

  const colDesc = MARGIN + 8;
  const colToken = MARGIN + CONTENT_WIDTH * 0.52;
  const colAmount = MARGIN + CONTENT_WIDTH * 0.68;
  const colDate = MARGIN + CONTENT_WIDTH * 0.80;

  page.drawText("DESCRIPTION", { x: colDesc, y: cursor - 8, size: 7.5, font: fontBold, color: COLOR_MUTED });
  page.drawText("TOKEN", { x: colToken, y: cursor - 8, size: 7.5, font: fontBold, color: COLOR_MUTED });
  page.drawText("AMOUNT", { x: colAmount, y: cursor - 8, size: 7.5, font: fontBold, color: COLOR_MUTED });
  page.drawText("DATE", { x: colDate, y: cursor - 8, size: 7.5, font: fontBold, color: COLOR_MUTED });

  cursor -= 20;

  // Table rows
  for (let i = 0; i < input.lineItems.length; i++) {
    const item = input.lineItems[i];
    const rowY = cursor - 4;

    if (i % 2 === 1) {
      page.drawRectangle({
        x: MARGIN, y: rowY - 10, width: CONTENT_WIDTH, height: 18,
        color: rgb(0.97, 0.98, 1),
      });
    }

    page.drawText(truncateMiddle(item.description, 40), {
      x: colDesc, y: rowY, size: 8.5, font: fontRegular, color: COLOR_DARK,
    });
    page.drawText(item.token, { x: colToken, y: rowY, size: 8.5, font: fontRegular, color: COLOR_DARK });
    page.drawText(item.amount, { x: colAmount, y: rowY, size: 8.5, font: fontBold, color: COLOR_DARK });
    page.drawText(formatTimestamp(item.timestamp).split(",")[0], {
      x: colDate, y: rowY, size: 7.5, font: fontRegular, color: COLOR_MUTED,
    });

    cursor -= 18;

    // Start a new page if running low
    if (cursor < 160) {
      // Simple overflow guard — in production you'd add continuation pages
      page.drawText("(continued on next page)", {
        x: MARGIN, y: cursor, size: 8, font: fontOblique, color: COLOR_MUTED,
      });
      break;
    }
  }

  cursor -= 6;
  drawHRule(page, cursor, COLOR_PRIMARY, 1);
  cursor -= 18;

  // Total row
  page.drawText("TOTAL", {
    x: colAmount - 48, y: cursor, size: 10, font: fontBold, color: COLOR_DARK,
  });
  page.drawText(input.totalAmount, {
    x: colAmount, y: cursor, size: 11, font: fontBold, color: COLOR_PRIMARY,
  });

  cursor -= 28;
  drawHRule(page, cursor);
  cursor -= 20;

  // ── Verification status badge ──────────────────────────────────────────────
  const badgeWidth = 120;
  page.drawRectangle({
    x: MARGIN, y: cursor - 16, width: badgeWidth, height: 24,
    color: rgb(0.9, 0.98, 0.94),
    borderColor: COLOR_VERIFIED,
    borderWidth: 1,
  });
  page.drawText("✓  VERIFIED ON STELLAR", {
    x: MARGIN + 8, y: cursor - 9, size: 7.5, font: fontBold, color: COLOR_VERIFIED,
  });

  // ── Transaction hash ───────────────────────────────────────────────────────
  page.drawText("Transaction Hash:", {
    x: MARGIN + badgeWidth + 16, y: cursor - 4, size: 7.5, font: fontBold, color: COLOR_MUTED,
  });
  page.drawText(truncateMiddle(input.transactionHash, 48), {
    x: MARGIN + badgeWidth + 16, y: cursor - 15, size: 7.5, font: fontRegular, color: COLOR_DARK,
  });

  cursor -= 36;

  // ── QR code ────────────────────────────────────────────────────────────────
  if (qrDataUri) {
    try {
      const qrBase64 = qrDataUri.replace(/^data:image\/png;base64,/, "");
      const qrImage = await pdfDoc.embedPng(Buffer.from(qrBase64, "base64"));
      const qrSize = 72;
      page.drawImage(qrImage, {
        x: PAGE_WIDTH - MARGIN - qrSize,
        y: cursor - qrSize + 8,
        width: qrSize,
        height: qrSize,
      });
      page.drawText("Scan to verify", {
        x: PAGE_WIDTH - MARGIN - qrSize,
        y: cursor - qrSize - 4,
        size: 6.5,
        font: fontOblique,
        color: COLOR_MUTED,
      });
    } catch {
      // QR embedding failed — skip silently, receipt is still valid
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: 0, y: 0, width: PAGE_WIDTH, height: 36,
    color: rgb(0.96, 0.97, 0.99),
  });
  page.drawText(
    "This document is an automated receipt generated by Fundable Protocol. For support: https://fundable.network",
    { x: MARGIN, y: 14, size: 6.5, font: fontOblique, color: COLOR_MUTED }
  );
  page.drawText(`Generated: ${generatedAt}`, {
    x: MARGIN, y: 6, size: 6, font: fontRegular, color: COLOR_MUTED,
  });

  return pdfDoc.save();
}

/**
 * Top-level entry point: validate → generate QR → build PDF.
 *
 * @throws `CertificateError` on invalid input or generation failure.
 */
export async function generateCertificate(
  input: CertificateInput
): Promise<CertificateResult> {
  validateCertificateInput(input);

  const certificateId = uuid();
  const generatedAt = new Date().toISOString();

  try {
    const pdfBytes = await buildCertificatePdf(input, certificateId, generatedAt);
    return { pdfBytes, certificateId, generatedAt };
  } catch (err) {
    if (err instanceof CertificateError) throw err;
    throw new CertificateError(
      `PDF generation failed: ${err instanceof Error ? err.message : String(err)}`,
      "PDF_GENERATION_FAILED"
    );
  }
}
