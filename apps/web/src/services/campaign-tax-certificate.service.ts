import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  getCampaign,
  getCampaignDataSource,
  type CampaignDataSource,
} from "./campaign.service";

export interface CharitableContributionAmount {
  token: string;
  amount: string;
}

export interface CampaignTaxCertificate {
  certificateId: string;
  campaignId: string;
  campaignName: string;
  sponsorAddress: string;
  partnerLegalName: string;
  partnerRegistrationNumber: string;
  partnerCountry: string;
  taxYear: number;
  contributions: CharitableContributionAmount[];
  issuedAt: string;
  pdfBytes: Uint8Array;
}

export class CampaignTaxCertificateError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_INPUT" | "CAMPAIGN_NOT_FOUND" | "INELIGIBLE_CAMPAIGN" | "NO_CONTRIBUTIONS" | "INVALID_LEDGER",
  ) {
    super(message);
    this.name = "CampaignTaxCertificateError";
  }
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 52;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const PRIMARY = rgb(0.12, 0.42, 0.34);
const DARK = rgb(0.12, 0.16, 0.15);
const MUTED = rgb(0.38, 0.43, 0.41);

function safePdfText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").normalize("NFKD").replace(/[^\x20-\x7E]/g, "?").slice(0, 180);
}

function drawFittedText(
  page: Awaited<ReturnType<PDFDocument["addPage"]>>,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  color = DARK,
  size = 11,
): void {
  const safeText = safePdfText(text);
  const textWidth = font.widthOfTextAtSize(safeText, size);
  const fittedSize = textWidth > maxWidth ? Math.max(6, size * (maxWidth / textWidth)) : size;
  page.drawText(safeText, { x, y, size: fittedSize, font, color });
}

async function buildCertificatePdf(input: Omit<CampaignTaxCertificate, "pdfBytes">): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`Charitable Contribution Acknowledgment ${input.certificateId}`);
  document.setAuthor("Fundable Protocol");
  document.setSubject(`Campaign contribution acknowledgment for tax year ${input.taxYear}`);
  document.setCreationDate(new Date(input.issuedAt));

  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const oblique = await document.embedFont(StandardFonts.HelveticaOblique);

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 92, width: PAGE_WIDTH, height: 92, color: PRIMARY });
  drawFittedText(page, "CHARITABLE CONTRIBUTION ACKNOWLEDGMENT", MARGIN, PAGE_HEIGHT - 45, CONTENT_WIDTH, bold, rgb(1, 1, 1), 17);
  drawFittedText(page, `Tax year ${input.taxYear}`, MARGIN, PAGE_HEIGHT - 69, CONTENT_WIDTH, regular, rgb(0.9, 0.96, 0.93), 10);

  let y = PAGE_HEIGHT - 139;
  const fields: Array<[string, string]> = [
    ["Campaign", input.campaignName],
    ["Sponsor wallet", input.sponsorAddress],
    ["Nonprofit partner", input.partnerLegalName],
    ["Partner registration number", input.partnerRegistrationNumber],
    ["Partner country", input.partnerCountry],
  ];
  for (const [label, value] of fields) {
    drawFittedText(page, label.toUpperCase(), MARGIN, y, CONTENT_WIDTH, regular, MUTED, 8);
    y -= 16;
    drawFittedText(page, value, MARGIN, y, CONTENT_WIDTH, bold, DARK, 11);
    y -= 34;
  }

  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, color: PRIMARY, thickness: 1 });
  y -= 28;
  drawFittedText(page, "RECORDED CHARITABLE CONTRIBUTIONS", MARGIN, y, CONTENT_WIDTH, bold, DARK, 10);
  y -= 25;
  for (const contribution of input.contributions) {
    drawFittedText(page, `${contribution.amount} ${contribution.token}`, MARGIN, y, CONTENT_WIDTH, bold, PRIMARY, 14);
    y -= 22;
  }

  y = Math.min(y - 24, 142);
  drawFittedText(
    page,
    "This acknowledgment reflects sponsorship amounts recorded by Fundable Protocol for the campaign and partner named above. Tax treatment depends on applicable law and any goods or services received; consult a qualified tax adviser. This document does not guarantee deductibility.",
    MARGIN,
    y,
    CONTENT_WIDTH,
    oblique,
    MUTED,
    8,
  );
  drawFittedText(page, `Certificate ${input.certificateId} | Issued ${input.issuedAt}`, MARGIN, 48, CONTENT_WIDTH, regular, MUTED, 7);

  return document.save();
}

export async function generateCampaignTaxCertificate(
  campaignId: string,
  sponsorAddress: string,
  taxYear: number,
  dataSource: CampaignDataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<CampaignTaxCertificate> {
  if (!campaignId.trim()) throw new CampaignTaxCertificateError("campaignId is required", "INVALID_INPUT");
  if (!sponsorAddress?.trim()) throw new CampaignTaxCertificateError("sponsorAddress is required", "INVALID_INPUT");
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    throw new CampaignTaxCertificateError("taxYear must be a valid calendar year", "INVALID_INPUT");
  }

  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) throw new CampaignTaxCertificateError("Campaign not found", "CAMPAIGN_NOT_FOUND");
  const partner = campaign.nonprofitPartner;
  if (
    !partner || partner.verificationStatus !== "VERIFIED" ||
    !partner.legalName.trim() || !partner.registrationNumber.trim() || !partner.country.trim()
  ) {
    throw new CampaignTaxCertificateError("Campaign does not have a verified nonprofit partner", "INELIGIBLE_CAMPAIGN");
  }

  const totals = new Map<string, bigint>();
  for (const sponsor of campaign.sponsors ?? []) {
    if (sponsor.campaignId !== campaign.id) continue;
    if (sponsor.address.trim().toLowerCase() !== sponsorAddress.trim().toLowerCase()) continue;
    if (new Date(sponsor.sponsoredAt).getUTCFullYear() !== taxYear) continue;
    if (!/^\d+$/.test(sponsor.amount) || !sponsor.token.trim()) {
      throw new CampaignTaxCertificateError("Invalid contribution data in campaign ledger", "INVALID_LEDGER");
    }
    const token = sponsor.token.trim().toUpperCase();
    totals.set(token, (totals.get(token) ?? 0n) + BigInt(sponsor.amount));
  }

  const contributions = Array.from(totals, ([token, amount]) => ({ token, amount: amount.toString() }))
    .sort((left, right) => left.token.localeCompare(right.token));
  if (contributions.length === 0) {
    throw new CampaignTaxCertificateError("No contributions found for this sponsor and tax year", "NO_CONTRIBUTIONS");
  }

  const certificateId = crypto.randomUUID();
  const issuedAt = new Date(now).toISOString();
  const result = {
    certificateId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    sponsorAddress: sponsorAddress.trim(),
    partnerLegalName: partner.legalName,
    partnerRegistrationNumber: partner.registrationNumber,
    partnerCountry: partner.country,
    taxYear,
    contributions,
    issuedAt,
  };
  return { ...result, pdfBytes: await buildCertificatePdf(result) };
}