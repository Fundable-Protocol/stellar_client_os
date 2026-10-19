import {
  CampaignDataSource,
  CampaignRecord,
  CampaignStatus,
  getCampaign,
  getCampaignDataSource,
  recordCampaignContribution,
} from "./campaign.service";
import {
  CampaignDonation,
  DONATION_ALLOCATION,
  DONATION_ALLOCATION_DESCRIPTION,
  DONATION_ALLOCATION_LABEL,
  DONATION_TOKENS,
  DonationReceipt,
  DonationSummary,
  DonationToken,
  MAX_DONATION_MESSAGE_LENGTH,
  donationReceiptReference,
  isDonationToken,
  normalizeDonationAmount,
  validateDonationAmount,
} from "@/types/campaign-donation";
import { EmailService } from "./email.service";
import type { CampaignEmailer } from "./campaign.service";
import { buildPledgeThankYouEmail } from "./pledge-thank-you-email.service";
import {
  TaxReceipt,
  generateTaxReceiptForContribution,
  isNonprofitEligible,
} from "./tax-receipt.service";

/**
 * One-time charitable campaign donations (issue #1001).
 *
 * Donors contribute a flexible amount that is *not* tied to specific trees —
 * the funds are released to the campaign creator's discretion for project
 * costs. Every donation is written to the campaign contribution ledger (so the
 * raised total and funding milestones stay consistent) and produces a receipt
 * the donor can keep.
 *
 * Mirrors the in-memory singleton pattern used by the other campaign services
 * until a persistent data source lands.
 */

export type DonationErrorCode =
  | "INVALID_CAMPAIGN"
  | "CAMPAIGN_NOT_ACCEPTING"
  | "INVALID_AMOUNT"
  | "INVALID_TOKEN"
  | "INVALID_DONOR"
  | "MESSAGE_TOO_LONG";

export interface CreateDonationInput {
  campaignId: string;
  donorAddress: string;
  donorName?: string;
  donorEmail?: string;
  amount: string | number;
  token?: string;
  rewardTier?: string;
  message?: string;
  anonymous?: boolean;
  txHash?: string;
  /** Caller-supplied key that makes retries safe: a repeat call returns the original donation. */
  idempotencyKey?: string;
}

export type DonationResult =
  | {
      ok: true;
      donation: CampaignDonation;
      receipt: DonationReceipt;
      campaign: CampaignRecord;
      /** Funding milestones the donation pushed the campaign across. */
      milestones: number[];
    }
  | { ok: false; error: string; code: DonationErrorCode };

/** Campaign states that still accept new donations. */
export const DONATION_ACCEPTING_STATUSES: readonly CampaignStatus[] = ["ACTIVE"];

export class CampaignDonationService {
  private donations = new Map<string, CampaignDonation[]>();
  private receipts = new Map<string, DonationReceipt>();
  private idempotency = new Map<string, string>();
  private taxReceipts = new Map<string, TaxReceipt>();

  constructor(private readonly emailService: CampaignEmailer = new EmailService()) {}

  private idempotencyKey(campaignId: string, key: string): string {
    return `${campaignId.trim()}::${key.trim()}`;
  }

  private campaignDonations(campaignId: string): CampaignDonation[] {
    return this.donations.get(campaignId.trim()) ?? [];
  }

  /**
   * Record a one-time donation and issue its receipt.
   *
   * Returns a discriminated result rather than throwing so the API route and UI
   * can map validation problems to status codes and inline messages.
   */
  async donate(
    input: CreateDonationInput,
    dataSource: CampaignDataSource = getCampaignDataSource(),
    now: number = Date.now(),
  ): Promise<DonationResult> {
    const campaignId = input.campaignId?.trim() ?? "";
    const donorAddress = String(input.donorAddress ?? "").trim();
    const donorEmail = input.donorEmail?.trim();

    if (!donorAddress) {
      return { ok: false, error: "A connected wallet address is required.", code: "INVALID_DONOR" };
    }

    if ((input.donorName?.length ?? 0) > 120 || (input.rewardTier?.length ?? 0) > 120) {
      return { ok: false, error: "Backer name and reward tier must be 120 characters or fewer.", code: "INVALID_DONOR" };
    }

    if (donorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail)) {
      return { ok: false, error: "Enter a valid email address.", code: "INVALID_DONOR" };
    }

    if (input.message && input.message.trim().length > MAX_DONATION_MESSAGE_LENGTH) {
      return {
        ok: false,
        error: `Your message must be ${MAX_DONATION_MESSAGE_LENGTH} characters or fewer.`,
        code: "MESSAGE_TOO_LONG",
      };
    }

    if (input.token !== undefined && !isDonationToken(input.token)) {
      return { ok: false, error: `Unsupported donation token: ${String(input.token)}.`, code: "INVALID_TOKEN" };
    }
    const token: DonationToken = isDonationToken(input.token) ? input.token : "XLM";

    const amountError = validateDonationAmount(input.amount);
    if (amountError) {
      return { ok: false, error: amountError, code: "INVALID_AMOUNT" };
    }
    const amount = normalizeDonationAmount(input.amount) as string;

    const campaign = await getCampaign(campaignId, dataSource);
    if (!campaign) {
      return { ok: false, error: "Campaign not found.", code: "INVALID_CAMPAIGN" };
    }
    if (!DONATION_ACCEPTING_STATUSES.includes(campaign.status)) {
      return {
        ok: false,
        error: `This campaign is ${campaign.status.toLowerCase()} and is not accepting donations.`,
        code: "CAMPAIGN_NOT_ACCEPTING",
      };
    }

    // Retries (double-clicks, network replays) resolve to the original record.
    const idempotencyKey = input.idempotencyKey?.trim();
    if (idempotencyKey) {
      const existingId = this.idempotency.get(this.idempotencyKey(campaignId, idempotencyKey));
      if (existingId) {
        const existing = this.campaignDonations(campaignId).find((entry) => entry.id === existingId);
        const receipt = this.receipts.get(existingId);
        if (existing && receipt) {
          return { ok: true, donation: existing, receipt, campaign, milestones: [] };
        }
      }
    }

    // Reuse the campaign contribution ledger so raised totals and the
    // creator's funding-milestone notifications behave exactly as for any
    // other contribution. Donations are whole tokens, matching the ledger.
    const recorded = await recordCampaignContribution(campaignId, amount, dataSource);
    if (!recorded) {
      return { ok: false, error: "Campaign not found.", code: "INVALID_CAMPAIGN" };
    }

    const donation: CampaignDonation = {
      id: `dn-${now}-${Math.random().toString(36).slice(2, 8)}`,
      campaignId,
      donorAddress,
      amount,
      token,
      allocation: DONATION_ALLOCATION,
      message: input.message?.trim() || undefined,
      anonymous: Boolean(input.anonymous),
      status: "CONFIRMED",
      txHash: input.txHash?.trim() || undefined,
      idempotencyKey: idempotencyKey || undefined,
      createdAt: now,
      confirmedAt: now,
    };

    const receipt: DonationReceipt = {
      receiptId: `rc-${donation.id}`,
      reference: donationReceiptReference(campaignId, donation.id),
      donationId: donation.id,
      campaignId,
      campaignName: recorded.campaign.name,
      donorAddress,
      amount,
      token,
      allocation: DONATION_ALLOCATION,
      allocationLabel: DONATION_ALLOCATION_LABEL,
      allocationDescription: DONATION_ALLOCATION_DESCRIPTION,
      status: donation.status,
      issuedAt: now,
    };

    const list = this.campaignDonations(campaignId);
    list.push(donation);
    this.donations.set(campaignId, list);
    this.receipts.set(donation.id, receipt);
    if (idempotencyKey) {
      this.idempotency.set(this.idempotencyKey(campaignId, idempotencyKey), donation.id);
    }

    if (donorEmail) {
      try {
        const siteUrl = process.env.NEXT_PUBLIC_URL ?? "https://fundable.network";
        const email = buildPledgeThankYouEmail(recorded.campaign, {
          backerName: input.donorName,
          amount,
          token,
          rewardTier: input.rewardTier,
          campaignUrl: new URL(`/campaigns/${encodeURIComponent(campaignId)}`, siteUrl).toString(),
        });
        await this.emailService.sendEmail({ to: donorEmail, ...email });
      } catch {
        // A mail provider outage must not undo a confirmed on-chain donation.
      }
    }

    // Charitable / non-profit campaigns issue a downloadable tax receipt.
    // Generation and delivery failures must never roll back the donation.
    if (isNonprofitEligible(recorded.campaign)) {
      try {
        const taxReceipt = await generateTaxReceiptForContribution({
          campaign: recorded.campaign,
          donation,
          donorName: input.donorName,
          donorEmail,
        });
        this.taxReceipts.set(taxReceipt.receiptId, taxReceipt);

        if (donorEmail) {
          try {
            await this.emailService.sendTaxReceiptEmail({ to: donorEmail, receipt: taxReceipt });
          } catch {
            // Mail outage: the receipt stays available on the dashboard.
          }
        }
      } catch {
        // PDF generation failure must not undo a confirmed on-chain donation.
      }
    }

    return {
      ok: true,
      donation,
      receipt,
      campaign: recorded.campaign,
      milestones: recorded.milestones,
    };
  }

  /** Every donation recorded for a campaign, oldest first. */
  getDonations(campaignId: string): CampaignDonation[] {
    return [...this.campaignDonations(campaignId)];
  }

  getReceipt(donationId: string): DonationReceipt | undefined {
    return this.receipts.get(donationId);
  }

  /** Every tax receipt issued to a backer, newest first. */
  getTaxReceiptsForBacker(donorAddress: string): TaxReceipt[] {
    const address = String(donorAddress ?? "").trim();
    if (!address) return [];
    return [...this.taxReceipts.values()]
      .filter((receipt) => receipt.donorAddress === address)
      .sort((a, b) => b.issuedAt - a.issuedAt);
  }

  /** A single tax receipt, scoped to its owning backer. */
  getTaxReceipt(receiptId: string, donorAddress: string): TaxReceipt | undefined {
    const receipt = this.taxReceipts.get(String(receiptId ?? "").trim());
    if (!receipt) return undefined;
    return receipt.donorAddress === String(donorAddress ?? "").trim() ? receipt : undefined;
  }

  /** Exact per-token totals for a campaign so mixed tokens are never summed. */
  getSummary(campaignId: string): DonationSummary {
    const donations = this.campaignDonations(campaignId);
    const totalsByToken: Record<DonationToken, string> = { XLM: "0", USDC: "0" };

    for (const token of DONATION_TOKENS) {
      const total = donations
        .filter((donation) => donation.token === token)
        .reduce((sum, donation) => sum + BigInt(donation.amount), 0n);
      totalsByToken[token] = total.toString();
    }

    const latestDonationAt = donations.reduce<number | undefined>(
      (latest, donation) => (latest === undefined ? donation.createdAt : Math.max(latest, donation.createdAt)),
      undefined,
    );

    return {
      campaignId,
      donationCount: donations.length,
      totalsByToken,
      latestDonationAt,
    };
  }

  /** Test helper — wipes every in-memory collection. */
  reset(): void {
    this.donations.clear();
    this.receipts.clear();
    this.idempotency.clear();
    this.taxReceipts.clear();
  }
}

export const donationService = new CampaignDonationService();
