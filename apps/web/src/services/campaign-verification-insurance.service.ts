/**
 * Campaign Verification Insurance — issue #958 (v1)
 *
 * Lets sponsors insure a campaign's CO2 outcome with a carbon-verification
 * underwriter. The sponsor pays a premium up front; if the campaign's verified
 * CO2 impact falls short of the insured target once the verification window
 * closes, the underwriter pays out the shortfall pro rata:
 *
 *   payout = coverage * (target - verified) / target
 *
 * Lifecycle: quote -> bind -> settle.
 *   - `quote` asks every eligible underwriter for terms (valid for 72 hours).
 *   - `bind` turns a quote into a policy on the underwriter's book.
 *   - `settle` records the verified CO2 figure. Hitting the target settles the
 *     policy as fulfilled at any time; a shortfall can only be claimed after
 *     the verification deadline, since verification may still be in progress.
 *
 * Underwriters plug in through `UnderwriterClient`. v1 ships a rate-table
 * client; a partner API client implements the same interface.
 */

import { randomUUID } from "crypto";
import { applyBps, formatAmount, parseAmount } from "@/lib/decimal-amount";

export const VERIFICATION_STANDARDS = ["verra_vcs", "gold_standard", "fundable_mrv"] as const;
export type VerificationStandard = (typeof VERIFICATION_STANDARDS)[number];

export const QUOTE_TTL_MS = 72 * 60 * 60 * 1000;
export const MIN_VERIFICATION_WINDOW_DAYS = 30;
export const MAX_VERIFICATION_WINDOW_DAYS = 5 * 365;

/** Extra premium for methodologies with less independent assurance. */
const STANDARD_LOADING_BPS: Record<VerificationStandard, number> = {
  verra_vcs: 0,
  gold_standard: 0,
  fundable_mrv: 150,
};
/** Extra premium per started year of verification window beyond the first. */
const PER_EXTRA_YEAR_LOADING_BPS = 50;

export interface Underwriter {
  id: string;
  name: string;
  baseRateBps: number;
  supportedStandards: VerificationStandard[];
  /** Largest coverage amount accepted per policy, as a decimal string. */
  maxCoverage: string;
  active: boolean;
}

export interface QuoteRequest {
  campaignId: string;
  co2TargetTonnes: number;
  coverageAmount: string;
  asset: string;
  verificationStandard: VerificationStandard;
  verificationWindowDays: number;
}

export interface UnderwriterTerms {
  premiumRateBps: number;
}

export interface UnderwriterClient {
  readonly underwriter: Underwriter;
  /** Returns terms, or null when the underwriter declines the risk. */
  quote(request: QuoteRequest): Promise<UnderwriterTerms | null>;
  /** Registers the policy with the underwriter; returns their reference. */
  bind(policy: InsurancePolicy): Promise<{ externalPolicyRef: string }>;
  /** Files a claim for `payout`; returns the underwriter's claim reference. */
  fileClaim(policy: InsurancePolicy, payout: string): Promise<{ claimRef: string }>;
}

export interface InsuranceQuote extends QuoteRequest {
  id: string;
  underwriterId: string;
  underwriterName: string;
  premiumRateBps: number;
  premium: string;
  createdAt: string;
  expiresAt: string;
  boundPolicyId: string | null;
}

export type PolicyStatus = "active" | "fulfilled" | "claim_paid";

export interface PolicySettlement {
  verifiedCo2Tonnes: number;
  shortfallTonnes: number;
  payout: string;
  claimRef: string | null;
  settledAt: string;
}

export interface InsurancePolicy {
  id: string;
  quoteId: string;
  campaignId: string;
  sponsorAddress: string;
  underwriterId: string;
  externalPolicyRef: string | null;
  co2TargetTonnes: number;
  coverageAmount: string;
  premium: string;
  asset: string;
  verificationStandard: VerificationStandard;
  boundAt: string;
  verificationDeadline: string;
  status: PolicyStatus;
  settlement: PolicySettlement | null;
}

export type VerificationInsuranceErrorCode =
  | "INVALID_INPUT"
  | "NO_UNDERWRITER"
  | "QUOTE_NOT_FOUND"
  | "QUOTE_EXPIRED"
  | "QUOTE_ALREADY_BOUND"
  | "POLICY_NOT_FOUND"
  | "POLICY_NOT_ACTIVE"
  | "VERIFICATION_WINDOW_OPEN";

export class VerificationInsuranceError extends Error {
  constructor(message: string, public readonly code: VerificationInsuranceErrorCode) {
    super(message);
    this.name = "VerificationInsuranceError";
  }
}

/** Underwriter that prices from a fixed rate table (v1 integration). */
export class RateTableUnderwriterClient implements UnderwriterClient {
  constructor(public readonly underwriter: Underwriter) {}

  async quote(request: QuoteRequest): Promise<UnderwriterTerms | null> {
    const u = this.underwriter;
    if (!u.active || !u.supportedStandards.includes(request.verificationStandard)) return null;
    if (parseAmount(request.coverageAmount) > parseAmount(u.maxCoverage)) return null;

    const extraYears = Math.max(0, Math.ceil(request.verificationWindowDays / 365) - 1);
    return {
      premiumRateBps:
        u.baseRateBps +
        STANDARD_LOADING_BPS[request.verificationStandard] +
        extraYears * PER_EXTRA_YEAR_LOADING_BPS,
    };
  }

  async bind(policy: InsurancePolicy): Promise<{ externalPolicyRef: string }> {
    return { externalPolicyRef: `${this.underwriter.id}-pol-${policy.id.slice(0, 8)}` };
  }

  async fileClaim(policy: InsurancePolicy): Promise<{ claimRef: string }> {
    return { claimRef: `${this.underwriter.id}-clm-${policy.id.slice(0, 8)}` };
  }
}

export const DEFAULT_UNDERWRITERS: Underwriter[] = [
  {
    id: "terra-assure",
    name: "Terra Assure Carbon Underwriting",
    baseRateBps: 400,
    supportedStandards: ["verra_vcs", "gold_standard"],
    maxCoverage: "1000000",
    active: true,
  },
  {
    id: "canopy-re",
    name: "Canopy Re",
    baseRateBps: 550,
    supportedStandards: ["verra_vcs", "gold_standard", "fundable_mrv"],
    maxCoverage: "250000",
    active: true,
  },
];

const TONNE_SCALE = 1000; // settle in kilograms to keep ratios exact

function toKg(tonnes: number): bigint {
  return BigInt(Math.round(tonnes * TONNE_SCALE));
}

export class CampaignVerificationInsuranceService {
  private readonly clients = new Map<string, UnderwriterClient>();
  private readonly quotes = new Map<string, InsuranceQuote>();
  private readonly policies = new Map<string, InsurancePolicy>();

  constructor(
    clients: UnderwriterClient[] = DEFAULT_UNDERWRITERS.map((u) => new RateTableUnderwriterClient(u)),
    private readonly now: () => Date = () => new Date(),
  ) {
    for (const client of clients) this.clients.set(client.underwriter.id, client);
  }

  listUnderwriters(): Underwriter[] {
    return [...this.clients.values()].map((c) => c.underwriter);
  }

  async requestQuotes(request: QuoteRequest, underwriterId?: string): Promise<InsuranceQuote[]> {
    validateQuoteRequest(request);

    const candidates = underwriterId
      ? [this.clients.get(underwriterId)].filter((c): c is UnderwriterClient => Boolean(c))
      : [...this.clients.values()];

    const createdAt = this.now();
    const quotes: InsuranceQuote[] = [];
    for (const client of candidates) {
      const terms = await client.quote(request);
      if (!terms) continue;
      const quote: InsuranceQuote = {
        ...request,
        id: randomUUID(),
        underwriterId: client.underwriter.id,
        underwriterName: client.underwriter.name,
        premiumRateBps: terms.premiumRateBps,
        premium: formatAmount(applyBps(parseAmount(request.coverageAmount), terms.premiumRateBps)),
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + QUOTE_TTL_MS).toISOString(),
        boundPolicyId: null,
      };
      this.quotes.set(quote.id, quote);
      quotes.push(quote);
    }

    if (quotes.length === 0) {
      throw new VerificationInsuranceError(
        "No underwriter will cover this campaign on the requested terms",
        "NO_UNDERWRITER",
      );
    }
    return quotes.sort((a, b) => a.premiumRateBps - b.premiumRateBps);
  }

  async bindPolicy(campaignId: string, quoteId: string, sponsorAddress: string): Promise<InsurancePolicy> {
    const quote = this.quotes.get(quoteId);
    if (!quote || quote.campaignId !== campaignId) {
      throw new VerificationInsuranceError("Quote not found for this campaign", "QUOTE_NOT_FOUND");
    }
    if (quote.boundPolicyId) {
      throw new VerificationInsuranceError("Quote has already been bound", "QUOTE_ALREADY_BOUND");
    }
    const boundAt = this.now();
    if (boundAt.getTime() > Date.parse(quote.expiresAt)) {
      throw new VerificationInsuranceError("Quote has expired; request a new one", "QUOTE_EXPIRED");
    }

    const policy: InsurancePolicy = {
      id: randomUUID(),
      quoteId,
      campaignId,
      sponsorAddress,
      underwriterId: quote.underwriterId,
      externalPolicyRef: null,
      co2TargetTonnes: quote.co2TargetTonnes,
      coverageAmount: quote.coverageAmount,
      premium: quote.premium,
      asset: quote.asset,
      verificationStandard: quote.verificationStandard,
      boundAt: boundAt.toISOString(),
      verificationDeadline: new Date(
        boundAt.getTime() + quote.verificationWindowDays * 24 * 60 * 60 * 1000,
      ).toISOString(),
      status: "active",
      settlement: null,
    };

    // Mark the quote before awaiting the underwriter so a concurrent bind
    // cannot reuse it.
    quote.boundPolicyId = policy.id;
    try {
      const { externalPolicyRef } = await this.client(quote.underwriterId).bind(policy);
      policy.externalPolicyRef = externalPolicyRef;
    } catch (error) {
      quote.boundPolicyId = null;
      throw error;
    }

    this.policies.set(policy.id, policy);
    return policy;
  }

  listPolicies(campaignId: string, sponsorAddress?: string): InsurancePolicy[] {
    return [...this.policies.values()].filter(
      (p) => p.campaignId === campaignId && (!sponsorAddress || p.sponsorAddress === sponsorAddress),
    );
  }

  getPolicy(campaignId: string, policyId: string): InsurancePolicy {
    const policy = this.policies.get(policyId);
    if (!policy || policy.campaignId !== campaignId) {
      throw new VerificationInsuranceError("Policy not found for this campaign", "POLICY_NOT_FOUND");
    }
    return policy;
  }

  /** Records the verified CO2 outcome and pays any shortfall claim. */
  async settlePolicy(campaignId: string, policyId: string, verifiedCo2Tonnes: number): Promise<InsurancePolicy> {
    if (!Number.isFinite(verifiedCo2Tonnes) || verifiedCo2Tonnes < 0) {
      throw new VerificationInsuranceError("verifiedCo2Tonnes must be a non-negative number", "INVALID_INPUT");
    }
    const policy = this.getPolicy(campaignId, policyId);
    if (policy.status !== "active") {
      throw new VerificationInsuranceError("Policy has already been settled", "POLICY_NOT_ACTIVE");
    }

    const settledAt = this.now();
    const targetKg = toKg(policy.co2TargetTonnes);
    const verifiedKg = toKg(verifiedCo2Tonnes);

    if (verifiedKg >= targetKg) {
      policy.status = "fulfilled";
      policy.settlement = {
        verifiedCo2Tonnes,
        shortfallTonnes: 0,
        payout: "0",
        claimRef: null,
        settledAt: settledAt.toISOString(),
      };
      return policy;
    }

    if (settledAt.getTime() < Date.parse(policy.verificationDeadline)) {
      throw new VerificationInsuranceError(
        "CO2 target not yet met; shortfall claims open after the verification deadline",
        "VERIFICATION_WINDOW_OPEN",
      );
    }

    const shortfallKg = targetKg - verifiedKg;
    const payout = formatAmount((parseAmount(policy.coverageAmount) * shortfallKg) / targetKg);
    // Claim first: if the underwriter call fails the policy stays active and
    // settlement can be retried.
    const { claimRef } = await this.client(policy.underwriterId).fileClaim(policy, payout);

    policy.status = "claim_paid";
    policy.settlement = {
      verifiedCo2Tonnes,
      shortfallTonnes: Number(shortfallKg) / TONNE_SCALE,
      payout,
      claimRef,
      settledAt: settledAt.toISOString(),
    };
    return policy;
  }

  private client(underwriterId: string): UnderwriterClient {
    const client = this.clients.get(underwriterId);
    if (!client) {
      throw new VerificationInsuranceError(`Underwriter ${underwriterId} is not registered`, "NO_UNDERWRITER");
    }
    return client;
  }
}

function validateQuoteRequest(request: QuoteRequest): void {
  const fail = (message: string) => {
    throw new VerificationInsuranceError(message, "INVALID_INPUT");
  };
  if (!request.campaignId) fail("campaignId is required");
  if (!Number.isFinite(request.co2TargetTonnes) || request.co2TargetTonnes <= 0) {
    fail("co2TargetTonnes must be a positive number");
  }
  let coverage = 0n;
  try {
    coverage = parseAmount(request.coverageAmount);
  } catch {
    fail("coverageAmount must be a decimal string with up to 7 decimal places");
  }
  if (coverage <= 0n) fail("coverageAmount must be greater than zero");
  if (!VERIFICATION_STANDARDS.includes(request.verificationStandard)) {
    fail(`verificationStandard must be one of ${VERIFICATION_STANDARDS.join(", ")}`);
  }
  if (
    !Number.isInteger(request.verificationWindowDays) ||
    request.verificationWindowDays < MIN_VERIFICATION_WINDOW_DAYS ||
    request.verificationWindowDays > MAX_VERIFICATION_WINDOW_DAYS
  ) {
    fail(
      `verificationWindowDays must be an integer between ${MIN_VERIFICATION_WINDOW_DAYS} and ${MAX_VERIFICATION_WINDOW_DAYS}`,
    );
  }
}

let instance: CampaignVerificationInsuranceService | null = null;

export function getCampaignVerificationInsuranceService(): CampaignVerificationInsuranceService {
  instance ??= new CampaignVerificationInsuranceService();
  return instance;
}
