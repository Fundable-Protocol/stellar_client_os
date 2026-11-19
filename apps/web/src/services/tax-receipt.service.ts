import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';

/**
 * Tax receipt service.
 *
 * Generates downloadable tax receipt PDFs for backers who contribute to
 * campaigns registered as charitable / non-profit. Receipts are rendered with
 * pdf-lib and persisted in an in-memory store keyed by backer address and
 * campaign id.
 */

export type TaxReceiptErrorCode =
  | 'INELIGIBLE_CAMPAIGN'
  | 'INVALID_INPUT'
  | 'NOT_FOUND';

export class TaxReceiptError extends Error {
  public readonly code: TaxReceiptErrorCode;

  constructor(code: TaxReceiptErrorCode, message: string) {
    super(message);
    this.name = 'TaxReceiptError';
    this.code = code;
    Object.setPrototypeOf(this, TaxReceiptError.prototype);
  }
}

export type NonProfitVerificationStatus =
  | 'VERIFIED'
  | 'PENDING'
  | 'REJECTED'
  | 'UNVERIFIED';

export interface NonProfitPartner {
  legalName: string;
  registrationNumber: string;
  country: string;
  verificationStatus: NonProfitVerificationStatus;
}

export interface TaxReceiptCampaign {
  id: string;
  name: string;
  isNonProfit?: boolean;
  nonProfitPartner?: NonProfitPartner | null;
}

export interface TaxReceiptPledge {
  id: string;
  amount: number | string;
  token: string;
  /** Optional ISO timestamp of when the pledge was confirmed. */
  confirmedAt?: string | Date;
}

export interface GenerateTaxReceiptParams {
  campaign: TaxReceiptCampaign;
  pledge: TaxReceiptPledge;
  backerAddress: string;
  taxYear: number;
}

export interface TaxReceipt {
  receiptId: string;
  campaignId: string;
  campaignName: string;
  partnerLegalName: string;
  partnerRegistrationNumber: string;
  partnerCountry: string;
  backerAddress: string;
  amount: string;
  token: string;
  taxYear: number;
  issuedAt: string;
  pdf: Uint8Array;
}

// ---------------------------------------------------------------------------
// Layout helpers (mirrors campaign-tax-certificate.service)
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const LINE_HEIGHT = 18;

interface LayoutContext {
  page: PDFPage;
  font: PDFFont;
  boldFont: PDFFont;
  cursorY: number;
}

function drawText(
  ctx: LayoutContext,
  text: string,
  options: { bold?: boolean; size?: number; color?: { r: number; g: number; b: number } } = {},
): void {
  const size = options.size ?? 12;
  const font = options.bold ? ctx.boldFont : ctx.font;
  const color = options.color ?? { r: 0.1, g: 0.1, b: 0.1 };

  ctx.page.drawText(text, {
    x: MARGIN,
    y: ctx.cursorY,
    size,
    font,
    color: rgb(color.r, color.g, color.b),
  });
  ctx.cursorY -= LINE_HEIGHT;
}

function drawDivider(ctx: LayoutContext): void {
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.cursorY + 6 },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.cursorY + 6 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  ctx.cursorY -= LINE_HEIGHT;
}

function drawLabelValue(ctx: LayoutContext, label: string, value: string): void {
  drawText(ctx, `${label}: ${value}`);
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

/** Keyed by `${backerAddress.toLowerCase()}:${campaignId}`. */
const receiptsByBackerAndCampaign = new Map<string, TaxReceipt[]>();
/** Keyed by receiptId for fast lookup. */
const receiptsById = new Map<string, TaxReceipt>();

function storeKey(backerAddress: string, campaignId: string): string {
  return `${backerAddress.toLowerCase()}:${campaignId}`;
}

let receiptCounter = 0;

function nextReceiptId(taxYear: number): string {
  receiptCounter += 1;
  const seq = String(receiptCounter).padStart(6, '0');
  return `TR-${taxYear}-${seq}`;
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/**
 * Returns true when the campaign is flagged as non-profit and its nonprofit
 * partner has been VERIFIED during onboarding.
 */
export function isEligibleForTaxReceipt(
  campaign: TaxReceiptCampaign | null | undefined,
): boolean {
  if (!campaign || !campaign.isNonProfit) {
    return false;
  }
  const partner = campaign.nonProfitPartner;
  if (!partner) {
    return false;
  }
  return partner.verificationStatus === 'VERIFIED';
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TaxReceiptError('INVALID_INPUT', `Missing or invalid ${field}`);
  }
  return value.trim();
}

function normalizeAmount(amount: number | string): string {
  const numeric = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new TaxReceiptError('INVALID_INPUT', 'Pledge amount must be a positive number');
  }
  return numeric.toString();
}

function normalizeTaxYear(taxYear: number): number {
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    throw new TaxReceiptError('INVALID_INPUT', 'Invalid tax year');
  }
  return taxYear;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Renders a tax receipt PDF for an eligible campaign pledge and persists it in
 * the in-memory store.
 */
export async function generateTaxReceipt(
  params: GenerateTaxReceiptParams,
): Promise<TaxReceipt> {
  const { campaign, pledge, backerAddress, taxYear } = params ?? ({} as GenerateTaxReceiptParams);

  if (!campaign) {
    throw new TaxReceiptError('INVALID_INPUT', 'Campaign is required');
  }
  if (!isEligibleForTaxReceipt(campaign)) {
    throw new TaxReceiptError(
      'INELIGIBLE_CAMPAIGN',
      'Campaign is not eligible for tax receipts',
    );
  }

  const partner = campaign.nonProfitPartner as NonProfitPartner;
  const campaignId = assertNonEmptyString(campaign.id, 'campaign id');
  const campaignName = assertNonEmptyString(campaign.name, 'campaign name');
  const partnerLegalName = assertNonEmptyString(partner.legalName, 'partner legal name');
  const partnerRegistrationNumber = assertNonEmptyString(
    partner.registrationNumber,
    'partner registration number',
  );
  const partnerCountry = assertNonEmptyString(partner.country, 'partner country');
  const normalizedBacker = assertNonEmptyString(backerAddress, 'backer address');

  if (!pledge) {
    throw new TaxReceiptError('INVALID_INPUT', 'Pledge is required');
  }
  const amount = normalizeAmount(pledge.amount);
  const token = assertNonEmptyString(pledge.token, 'token');
  const normalizedTaxYear = normalizeTaxYear(taxYear);

  const receiptId = nextReceiptId(normalizedTaxYear);
  const issuedAt = new Date().toISOString();

  const pdfBytes = await renderReceiptPdf({
    receiptId,
    campaignName,
    partnerLegalName,
    partnerRegistrationNumber,
    partnerCountry,
    backerAddress: normalizedBacker,
    amount,
    token,
    taxYear: normalizedTaxYear,
    issuedAt,
  });

  const receipt: TaxReceipt = {
    receiptId,
    campaignId,
    campaignName,
    partnerLegalName,
    partnerRegistrationNumber,
    partnerCountry,
    backerAddress: normalizedBacker,
    amount,
    token,
    taxYear: normalizedTaxYear,
    issuedAt,
    pdf: pdfBytes,
  };

  const key = storeKey(normalizedBacker, campaignId);
  const existing = receiptsByBackerAndCampaign.get(key);
  if (existing) {
    existing.push(receipt);
  } else {
    receiptsByBackerAndCampaign.set(key, [receipt]);
  }
  receiptsById.set(receiptId, receipt);

  return receipt;
}

interface RenderReceiptPdfParams {
  receiptId: string;
  campaignName: string;
  partnerLegalName: string;
  partnerRegistrationNumber: string;
  partnerCountry: string;
  backerAddress: string;
  amount: string;
  token: string;
  taxYear: number;
  issuedAt: string;
}

async function renderReceiptPdf(data: RenderReceiptPdfParams): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: LayoutContext = {
    page,
    font,
    boldFont,
    cursorY: PAGE_HEIGHT - MARGIN,
  };

  drawText(ctx, 'Charitable Contribution Tax Receipt', { bold: true, size: 18 });
  drawDivider(ctx);

  drawLabelValue(ctx, 'Receipt ID', data.receiptId);
  drawLabelValue(ctx, 'Tax Year', String(data.taxYear));
  drawLabelValue(ctx, 'Issued At', data.issuedAt);
  drawDivider(ctx);

  drawText(ctx, 'Campaign', { bold: true, size: 13 });
  drawLabelValue(ctx, 'Name', data.campaignName);
  drawDivider(ctx);

  drawText(ctx, 'Non-Profit Partner', { bold: true, size: 13 });
  drawLabelValue(ctx, 'Legal Name', data.partnerLegalName);
  drawLabelValue(ctx, 'Registration Number', data.partnerRegistrationNumber);
  drawLabelValue(ctx, 'Country', data.partnerCountry);
  drawDivider(ctx);

  drawText(ctx, 'Backer', { bold: true, size: 13 });
  drawLabelValue(ctx, 'Address', data.backerAddress);
  drawDivider(ctx);

  drawText(ctx, 'Contribution', { bold: true, size: 13 });
  drawLabelValue(ctx, 'Amount', data.amount);
  drawLabelValue(ctx, 'Token', data.token);
  drawDivider(ctx);

  drawText(
    ctx,
    'This receipt acknowledges a charitable contribution to the campaign above.',
    { size: 10, color: { r: 0.4, g: 0.4, b: 0.4 } },
  );

  return doc.save();
}

// ---------------------------------------------------------------------------
// Dashboard accessors
// ---------------------------------------------------------------------------

/**
 * Lists all tax receipts issued to a backer, most recent first.
 */
export function listTaxReceipts(backerAddress: string): TaxReceipt[] {
  const normalized = assertNonEmptyString(backerAddress, 'backer address').toLowerCase();
  const results: TaxReceipt[] = [];

  for (const [key, receipts] of receiptsByBackerAndCampaign.entries()) {
    if (key.startsWith(`${normalized}:`)) {
      results.push(...receipts);
    }
  }

  return results.sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : a.issuedAt > b.issuedAt ? -1 : 0));
}

/**
 * Retrieves a single tax receipt by id, scoped to the owning backer.
 */
export function getTaxReceipt(receiptId: string, backerAddress: string): TaxReceipt {
  const normalizedId = assertNonEmptyString(receiptId, 'receipt id');
  const normalizedBacker = assertNonEmptyString(backerAddress, 'backer address').toLowerCase();

  const receipt = receiptsById.get(normalizedId);
  if (!receipt || receipt.backerAddress.toLowerCase() !== normalizedBacker) {
    throw new TaxReceiptError('NOT_FOUND', 'Tax receipt not found');
  }

  return receipt;
}

/** Test helper: clears the in-memory receipt store. */
export function __resetTaxReceiptStore(): void {
  receiptsByBackerAndCampaign.clear();
  receiptsById.clear();
  receiptCounter = 0;
}