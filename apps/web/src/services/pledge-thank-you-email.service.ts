import type { CampaignRecord } from "./campaign.service";

export interface PledgeThankYouDetails {
  backerName?: string;
  amount: string;
  token: string;
  rewardTier?: string;
  campaignUrl: string;
}

const DEFAULT_GREETING = "Hi {{backerName}},";
const DEFAULT_BODY =
  "Thank you for pledging {{amount}} {{token}} to {{campaignName}}. Your support at the {{rewardTier}} reward tier helps make this campaign possible.";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return escapeHtml(template).replace(/\{\{(backerName|amount|token|rewardTier|campaignName)\}\}/g, (_match, key: string) =>
    values[key] ?? "",
  );
}

export interface TaxReceiptDetails {
  backerName?: string;
  amount: string;
  token: string;
  receiptNumber: string;
  issuedAt: string;
}

export function buildTaxReceiptEmail(
  campaign: Pick<CampaignRecord, "id" | "name">,
  receipt: TaxReceiptDetails,
  downloadUrl: string,
) {
  const backerName = escapeHtml(receipt.backerName?.trim() || "there");
  const amount = escapeHtml(receipt.amount);
  const token = escapeHtml(receipt.token);
  const receiptNumber = escapeHtml(receipt.receiptNumber);
  const issuedAt = escapeHtml(receipt.issuedAt);
  const campaignName = escapeHtml(campaign.name);
  const receiptUrl = escapeHtml(downloadUrl);

  return {
    subject: `Your tax receipt for supporting ${campaign.name}`,
    html: [
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;line-height:1.6">',
      `<p>Hi ${backerName},</p>`,
      `<p>Thank you for pledging ${amount} ${token} to ${campaignName}. Your contribution may be tax-deductible.</p>`,
      `<p>Receipt number: ${receiptNumber}<br>Issued on: ${issuedAt}</p>`,
      `<p><a href="${receiptUrl}">Download your tax receipt (PDF)</a></p>`,
      "</div>",
    ].join("\n"),
  };
}

export function buildPledgeThankYouEmail(
  campaign: Pick<CampaignRecord, "id" | "name" | "pledgeThankYouGreeting" | "pledgeThankYouBody">,
  details: PledgeThankYouDetails,
) {
  const values = {
    backerName: escapeHtml(details.backerName?.trim() || "there"),
    amount: escapeHtml(details.amount),
    token: escapeHtml(details.token),
    rewardTier: escapeHtml(details.rewardTier?.trim() || "No reward tier selected"),
    campaignName: escapeHtml(campaign.name),
  };
  const greeting = renderTemplate(campaign.pledgeThankYouGreeting?.trim() || DEFAULT_GREETING, values);
  const body = renderTemplate(campaign.pledgeThankYouBody?.trim() || DEFAULT_BODY, values);
  const campaignUrl = escapeHtml(details.campaignUrl);

  return {
    subject: `Thank you for supporting ${campaign.name}`,
    html: [
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;line-height:1.6">',
      `<p>${greeting}</p>`,
      `<p>${body.replace(/\n/g, "<br>")}</p>`,
      `<p><a href="${campaignUrl}">View the campaign</a></p>`,
      "</div>",
    ].join("\n"),
  };
}
