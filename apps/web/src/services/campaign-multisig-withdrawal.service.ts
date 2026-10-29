/**
 * Campaign Multi-Signature Withdrawal Service
 *
 * For campaigns whose goal meets or exceeds a platform-configured threshold,
 * withdrawals require approval from BOTH the campaign creator and a platform
 * trustee before funds can be released.
 *
 * - Platform admins configure the threshold and the trustee registry.
 * - Qualifying campaigns complete a multi-sig setup (assigning a trustee).
 * - The creator opens a withdrawal request (signing it) and the assigned
 *   trustee co-signs it from the trustee dashboard.
 */

import { formatAmount, isAmountString, parseAmount } from "@/lib/decimal-amount";
import { getCampaign } from "./campaign.service";

export type MultisigErrorCode =
  | "INVALID_INPUT"
  | "CAMPAIGN_NOT_FOUND"
  | "NOT_QUALIFYING"
  | "SETUP_REQUIRED"
  | "NOT_AUTHORIZED"
  | "REQUEST_NOT_FOUND"
  | "INVALID_STATE";

export class MultisigError extends Error {
  constructor(
    public readonly code: MultisigErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MultisigError";
  }
}

export type WithdrawalStatus = "PENDING" | "APPROVED" | "REJECTED" | "RELEASED";

export interface MultisigConfig {
  /** Decimal amount string; campaigns with goal >= threshold need multi-sig. */
  threshold: string;
  updatedAt: number;
}

export interface CampaignMultisigSetup {
  campaignId: string;
  creator: string;
  trustee: string;
  createdAt: number;
}

export interface WithdrawalSignature {
  signer: string;
  role: "CREATOR" | "TRUSTEE";
  signedAt: number;
}

export interface MultisigWithdrawalRequest {
  id: string;
  campaignId: string;
  amount: string;
  destination: string;
  status: WithdrawalStatus;
  signatures: WithdrawalSignature[];
  /** Optional signed Stellar transaction XDR proposed for submission. */
  transactionXdr?: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_MULTISIG_THRESHOLD = "100000";

const same = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

export class CampaignMultisigWithdrawalService {
  private threshold: MultisigConfig = {
    threshold: process.env.MULTISIG_WITHDRAWAL_THRESHOLD && isAmountString(process.env.MULTISIG_WITHDRAWAL_THRESHOLD)
      ? process.env.MULTISIG_WITHDRAWAL_THRESHOLD
      : DEFAULT_MULTISIG_THRESHOLD,
    updatedAt: 0,
  };
  private trustees = new Set<string>();
  private setups = new Map<string, CampaignMultisigSetup>();
  private requests = new Map<string, MultisigWithdrawalRequest>();
  private counter = 0;

  /** Reset in-memory state (test isolation). */
  public reset(): void {
    this.threshold = { threshold: DEFAULT_MULTISIG_THRESHOLD, updatedAt: 0 };
    this.trustees.clear();
    this.setups.clear();
    this.requests.clear();
    this.counter = 0;
  }

  // ---- Admin configuration ------------------------------------------------

  public getConfig(): MultisigConfig & { trustees: string[] } {
    return { ...this.threshold, trustees: [...this.trustees] };
  }

  public setThreshold(threshold: unknown, now = Date.now()): MultisigConfig {
    if (typeof threshold !== "string" || !isAmountString(threshold.trim()) || parseAmount(threshold.trim()) <= 0n) {
      throw new MultisigError("INVALID_INPUT", "threshold must be a positive decimal amount string");
    }
    this.threshold = { threshold: threshold.trim(), updatedAt: now };
    return this.threshold;
  }

  public setTrustees(trustees: unknown): string[] {
    if (!Array.isArray(trustees) || trustees.some((t) => typeof t !== "string" || !t.trim())) {
      throw new MultisigError("INVALID_INPUT", "trustees must be an array of account addresses");
    }
    this.trustees = new Set(trustees.map((t: string) => t.trim()));
    return [...this.trustees];
  }

  public isTrustee(address?: string | null): boolean {
    return [...this.trustees].some((t) => same(t, address));
  }

  // ---- Qualification & setup ----------------------------------------------

  public async checkQualification(campaignId: string) {
    const campaign = await getCampaign(campaignId);
    if (!campaign) throw new MultisigError("CAMPAIGN_NOT_FOUND", "Campaign not found");
    let goal = 0n;
    try {
      goal = parseAmount(campaign.goalAmount);
    } catch {
      goal = 0n;
    }
    const qualifies = goal >= parseAmount(this.threshold.threshold);
    return {
      campaignId,
      creator: campaign.creator,
      goalAmount: campaign.goalAmount,
      threshold: this.threshold.threshold,
      requiresMultisig: qualifies,
      setup: this.setups.get(campaignId) ?? null,
    };
  }

  public async setupMultisig(
    input: { campaignId: string; callerAddress?: string; trustee?: string },
    now = Date.now(),
  ): Promise<CampaignMultisigSetup> {
    const status = await this.checkQualification(input.campaignId);
    if (!status.requiresMultisig) {
      throw new MultisigError("NOT_QUALIFYING", "Campaign is below the multi-sig threshold");
    }
    if (!same(status.creator, input.callerAddress)) {
      throw new MultisigError("NOT_AUTHORIZED", "Only the campaign creator can set up multi-sig");
    }
    if (!input.trustee || !this.isTrustee(input.trustee)) {
      throw new MultisigError("INVALID_INPUT", "trustee must be a registered platform trustee");
    }
    const setup: CampaignMultisigSetup = {
      campaignId: input.campaignId,
      creator: status.creator,
      trustee: input.trustee.trim(),
      createdAt: now,
    };
    this.setups.set(input.campaignId, setup);
    return setup;
  }

  // ---- Withdrawals --------------------------------------------------------

  /** Creator opens a withdrawal request; this counts as the creator's signature. */
  public async requestWithdrawal(
    input: {
      campaignId: string;
      callerAddress?: string;
      amount?: string;
      destination?: string;
      transactionXdr?: string;
    },
    now = Date.now(),
  ): Promise<MultisigWithdrawalRequest> {
    const status = await this.checkQualification(input.campaignId);
    if (!status.requiresMultisig) {
      throw new MultisigError("NOT_QUALIFYING", "Campaign is below the multi-sig threshold");
    }
    const setup = this.setups.get(input.campaignId);
    if (!setup) throw new MultisigError("SETUP_REQUIRED", "Multi-sig setup is required before withdrawing");
    if (!same(setup.creator, input.callerAddress)) {
      throw new MultisigError("NOT_AUTHORIZED", "Only the campaign creator can request a withdrawal");
    }
    if (!input.amount || !isAmountString(input.amount) || parseAmount(input.amount) <= 0n) {
      throw new MultisigError("INVALID_INPUT", "amount must be a positive decimal amount string");
    }
    if (!input.destination || !input.destination.trim()) {
      throw new MultisigError("INVALID_INPUT", "destination is required");
    }
    const id = `msw-${++this.counter}`;
    const request: MultisigWithdrawalRequest = {
      id,
      campaignId: input.campaignId,
      amount: formatAmount(parseAmount(input.amount)),
      destination: input.destination.trim(),
      status: "PENDING",
      signatures: [{ signer: setup.creator, role: "CREATOR", signedAt: now }],
      transactionXdr: input.transactionXdr,
      createdAt: now,
      updatedAt: now,
    };
    this.requests.set(id, request);
    return request;
  }

  private getRequestOrThrow(requestId: string): MultisigWithdrawalRequest {
    const request = this.requests.get(requestId);
    if (!request) throw new MultisigError("REQUEST_NOT_FOUND", "Withdrawal request not found");
    return request;
  }

  public getRequest(requestId: string): MultisigWithdrawalRequest | undefined {
    return this.requests.get(requestId);
  }

  public listCampaignRequests(campaignId: string): MultisigWithdrawalRequest[] {
    return [...this.requests.values()].filter((r) => r.campaignId === campaignId);
  }

  /** Requests waiting on this trustee's co-signature (or all of their requests when `all`). */
  public listForTrustee(trustee: string, all = false): MultisigWithdrawalRequest[] {
    if (!this.isTrustee(trustee)) {
      throw new MultisigError("NOT_AUTHORIZED", "Caller is not a platform trustee");
    }
    return [...this.requests.values()].filter((r) => {
      const setup = this.setups.get(r.campaignId);
      return setup && same(setup.trustee, trustee) && (all || r.status === "PENDING");
    });
  }

  public coSign(requestId: string, trusteeAddress?: string, now = Date.now()): MultisigWithdrawalRequest {
    const request = this.getRequestOrThrow(requestId);
    const setup = this.setups.get(request.campaignId);
    if (!setup || !same(setup.trustee, trusteeAddress) || !this.isTrustee(trusteeAddress)) {
      throw new MultisigError("NOT_AUTHORIZED", "Only the assigned platform trustee can co-sign");
    }
    if (request.status !== "PENDING") {
      throw new MultisigError("INVALID_STATE", `Request is already ${request.status}`);
    }
    request.signatures.push({ signer: setup.trustee, role: "TRUSTEE", signedAt: now });
    request.status = "APPROVED";
    request.updatedAt = now;
    return request;
  }

  public reject(requestId: string, trusteeAddress?: string, now = Date.now()): MultisigWithdrawalRequest {
    const request = this.getRequestOrThrow(requestId);
    const setup = this.setups.get(request.campaignId);
    if (!setup || !same(setup.trustee, trusteeAddress) || !this.isTrustee(trusteeAddress)) {
      throw new MultisigError("NOT_AUTHORIZED", "Only the assigned platform trustee can reject");
    }
    if (request.status !== "PENDING") {
      throw new MultisigError("INVALID_STATE", `Request is already ${request.status}`);
    }
    request.status = "REJECTED";
    request.updatedAt = now;
    return request;
  }

  /** Releases funds; only allowed once both creator and trustee have signed. */
  public release(requestId: string, callerAddress?: string, now = Date.now()): MultisigWithdrawalRequest {
    const request = this.getRequestOrThrow(requestId);
    const setup = this.setups.get(request.campaignId);
    if (!setup || !same(setup.creator, callerAddress)) {
      throw new MultisigError("NOT_AUTHORIZED", "Only the campaign creator can release approved funds");
    }
    const roles = new Set(request.signatures.map((s) => s.role));
    if (request.status !== "APPROVED" || !roles.has("CREATOR") || !roles.has("TRUSTEE")) {
      throw new MultisigError("INVALID_STATE", "Both creator and trustee signatures are required");
    }
    request.status = "RELEASED";
    request.updatedAt = now;
    return request;
  }
}

export const campaignMultisigWithdrawalService = new CampaignMultisigWithdrawalService();
