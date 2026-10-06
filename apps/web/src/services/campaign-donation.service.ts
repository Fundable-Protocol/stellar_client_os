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
  amount: string | number;
  token?: string;
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

    if (!donorAddress) {
      return { ok: false, error: "A connected wallet address is required.", code: "INVALID_DONOR" };
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
  }
}

export const donationService = new CampaignDonationService();
