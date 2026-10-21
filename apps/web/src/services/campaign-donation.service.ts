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
  DEFAULT_MILESTONES,
  evaluateMilestones,
  type CampaignMilestone,
} from "./campaign-milestones";
import { CampaignMilestoneEmailService } from "./campaign-milestone-email.service";
import { buildCampaignNotificationDispatch } from "./campaign-notification.service";

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
  | "MESSAGE_TOO_LONG"
  | "UNSUPPORTED_CURRENCY";

/** Currencies a backer may pledge in (issue #1170). */
export const SUPPORTED_DONATION_CURRENCIES = ["USD", "EUR", "XLM", "USDC"] as const;

export type DonationCurrency = (typeof SUPPORTED_DONATION_CURRENCIES)[number];

export function isDonationCurrency(value: unknown): value is DonationCurrency {
  return typeof value === "string" && (SUPPORTED_DONATION_CURRENCIES as readonly string[]).includes(value);
}

/** Number of decimal places conversion rates and converted amounts are rounded to. */
export const CONVERSION_DECIMALS = 7;

/**
 * A conversion quote captured at pledge time. `rate` is the multiplier applied
 * to the original amount to obtain the converted amount, rounded to
 * `CONVERSION_DECIMALS` places.
 */
export interface ConversionQuote {
  originalCurrency: DonationCurrency;
  convertedCurrency: DonationCurrency;
  originalAmount: string;
  convertedAmount: string;
  rate: string;
  /** Epoch milliseconds at which the rate was captured. */
  quotedAt: number;
}

/** Supplies the exchange rate between two supported currencies. */
export interface ConversionRateProvider {
  getRate(from: DonationCurrency, to: DonationCurrency, at: number): number;
}

/**
 * Default rate provider. Rates are expressed relative to USD and are static
 * placeholders until a live oracle is wired in; `getRate` still returns a
 * timestamped quote so callers can display when the rate was captured.
 */
export class StaticConversionRateProvider implements ConversionRateProvider {
  constructor(private readonly usdRates: Record<DonationCurrency, number> = DEFAULT_USD_RATES) {}

  getRate(from: DonationCurrency, to: DonationCurrency, _at: number): number {
    const fromRate = this.usdRates[from];
    const toRate = this.usdRates[to];
    if (!fromRate || !toRate) {
      throw new Error(`No conversion rate for ${from} -> ${to}.`);
    }
    return fromRate / toRate;
  }
}

/** Units of each currency per 1 USD. */
export const DEFAULT_USD_RATES: Record<DonationCurrency, number> = {
  USD: 1,
  EUR: 0.92,
  XLM: 8.5,
  USDC: 1,
};

/** Round a numeric amount to `CONVERSION_DECIMALS` places, returned as a string. */
export function roundConversionAmount(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Conversion amount must be a non-negative finite number.");
  }
  return value.toFixed(CONVERSION_DECIMALS);
}

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
  /** Currency the backer pledged in (issue #1170). Defaults to the pledge token. */
  originalCurrency?: string;
  /** Currency the pledge is converted to. Defaults to the original currency. */
  convertedCurrency?: string;
}

export type DonationResult =
  | {
      ok: true;
      donation: CampaignDonation;
      receipt: DonationReceipt;
      campaign: CampaignRecord;
      /** Funding milestones the donation pushed the campaign across. */
      milestones: number[];
      badges: Array<{ key: string; name: string; description: string; icon: string; awardedAt: number }>;
    }
  | { ok: false; error: string; code: DonationErrorCode };

/** Campaign states that still accept new donations. */
export const DONATION_ACCEPTING_STATUSES: readonly CampaignStatus[] = ["ACTIVE"];

export class CampaignDonationService {
  private donations = new Map<string, CampaignDonation[]>();
  private receipts = new Map<string, DonationReceipt>();
  private idempotency = new Map<string, string>();

  private readonly milestoneEmailService: CampaignMilestoneEmailService;

  constructor(
    private readonly emailService: CampaignEmailer = new EmailService(),
    private readonly rateProvider: ConversionRateProvider = new StaticConversionRateProvider(),
  ) {
    this.milestoneEmailService = new CampaignMilestoneEmailService(emailService);
  }

  /**
   * Produce a timestamped conversion quote for a pledge (issue #1170).
   *
   * Returns `null` when either currency is unsupported or the amount is
   * invalid so the UI can show an inline error before confirmation.
   */
  quoteConversion(
    originalCurrency: string,
    convertedCurrency: string,
    amount: string | number,
    now: number = Date.now(),
  ): ConversionQuote | null {
    if (!isDonationCurrency(originalCurrency) || !isDonationCurrency(convertedCurrency)) {
      return null;
    }
    if (validateDonationAmount(amount)) {
      return null;
    }
    const originalAmount = normalizeDonationAmount(amount) as string;
    const rate = this.rateProvider.getRate(originalCurrency, convertedCurrency, now);
    const convertedAmount = roundConversionAmount(Number(originalAmount) * rate);
    return {
      originalCurrency,
      convertedCurrency,
      originalAmount,
      convertedAmount,
      rate: roundConversionAmount(rate),
      quotedAt: now,
    };
  }

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

    // Resolve the pledge currencies (issue #1170). When omitted they default to
    // the pledge token so existing callers keep working unchanged.
    const originalCurrency = input.originalCurrency?.trim() || token;
    const convertedCurrency = input.convertedCurrency?.trim() || originalCurrency;
    if (!isDonationCurrency(originalCurrency) || !isDonationCurrency(convertedCurrency)) {
      return {
        ok: false,
        error: `Unsupported currency pair: ${originalCurrency} -> ${convertedCurrency}.`,
        code: "UNSUPPORTED_CURRENCY",
      };
    }
    let quote: ConversionQuote;
    try {
      const computed = this.quoteConversion(originalCurrency, convertedCurrency, amount, now);
      if (!computed) {
        return {
          ok: false,
          error: `Unsupported currency pair: ${originalCurrency} -> ${convertedCurrency}.`,
          code: "UNSUPPORTED_CURRENCY",
        };
      }
      quote = computed;
    } catch {
      return {
        ok: false,
        error: `Unsupported currency pair: ${originalCurrency} -> ${convertedCurrency}.`,
        code: "UNSUPPORTED_CURRENCY",
      };
    }

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
    const previousRaised = campaign.raised ?? 0;
    const recorded = await recordCampaignContribution(campaignId, amount, dataSource);
    if (!recorded) {
      return { ok: false, error: "Campaign not found.", code: "INVALID_CAMPAIGN" };
    }

    const newRaised = recorded.campaign.raised ?? previousRaised;
    const goalAmount = recorded.campaign.goal ?? campaign.goal ?? 0;
    const crossedMilestones = evaluateMilestones(
      recorded.campaign.milestones ?? campaign.milestones ?? DEFAULT_MILESTONES,
      previousRaised,
      newRaised,
      goalAmount,
    );

    if (crossedMilestones.length > 0) {
      await this.dispatchMilestoneNotifications(
        recorded.campaign,
        crossedMilestones,
        newRaised,
        goalAmount,
        dataSource,
      );
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
      originalCurrency: quote.originalCurrency,
      originalAmount: quote.originalAmount,
      convertedCurrency: quote.convertedCurrency,
      convertedAmount: quote.convertedAmount,
      conversionRate: quote.rate,
      conversionQuotedAt: quote.quotedAt,
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
      originalCurrency: quote.originalCurrency,
      originalAmount: quote.originalAmount,
      convertedCurrency: quote.convertedCurrency,
      convertedAmount: quote.convertedAmount,
      conversionRate: quote.rate,
      conversionQuotedAt: quote.quotedAt,
      issuedAt: now,
    };

    const list = this.campaignDonations(campaignId);
    list.push(donation);
    this.donations.set(campaignId, list);
    this.receipts.set(donation.id, receipt);
    if (idempotencyKey) {
      this.idempotency.set(this.idempotencyKey(campaignId, idempotencyKey), donation.id);
    }
    const badges = backerBadgeService.recordPledge({
      address: donorAddress,
      campaignId,
      amount,
      campaignCreatedAt: recorded.campaign.createdAt,
      pledgedAt: now,
    });

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
    return {
      ok: true,
      donation,
      receipt,
      campaign: recorded.campaign,
      milestones: crossedMilestones.map((milestone) => milestone.percentage),
    };
  }

  /**
   * Fire backer emails and in-app notifications for each newly crossed
   * milestone, then persist `notifiedAt` so a replay never re-notifies.
   */
  private async dispatchMilestoneNotifications(
    campaign: CampaignRecord,
    milestones: CampaignMilestone[],
    raised: number,
    goalAmount: number,
    dataSource: CampaignDataSource,
  ): Promise<void> {
    for (const milestone of milestones) {
      try {
        await this.milestoneEmailService.notifySponsors(campaign, milestone, raised, goalAmount);
      } catch {
        // A mail provider outage must not undo a confirmed donation.
      }

      try {
        buildCampaignNotificationDispatch(campaign, {
          type: "MILESTONE_REACHED",
          milestonePercentage: milestone.percentage,
          milestoneLabel: milestone.label,
          raised,
          goalAmount,
        });
      } catch {
        // In-app notification failures are non-fatal for the donation.
      }

      try {
        await this.persistMilestoneNotified(campaign.id, milestone, dataSource);
      } catch {
        // Persistence failures are non-fatal; the donation is already recorded.
      }
    }
  }

  /** Mark a milestone as notified on the campaign record. */
  private async persistMilestoneNotified(
    campaignId: string,
    milestone: CampaignMilestone,
    dataSource: CampaignDataSource,
  ): Promise<void> {
    const update = (dataSource as { updateCampaign?: CampaignDataSource["updateCampaign"] }).updateCampaign;
    if (typeof update !== "function") {
      return;
    }
    const current = await getCampaign(campaignId, dataSource);
    if (!current) {
      return;
    }
    const milestones = (current.milestones ?? DEFAULT_MILESTONES).map((entry) =>
      entry.percentage === milestone.percentage
        ? { ...entry, notifiedAt: entry.notifiedAt ?? Date.now() }
        : entry,
    );
    await update.call(dataSource, campaignId, { milestones });
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
