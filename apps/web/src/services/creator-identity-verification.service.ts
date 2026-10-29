/**
 * Optional, badge-earning identity verification flow for campaign creators.
 *
 * Steps (see docs/creator-identity-verification.md):
 *   1. Email          — 6-digit one-time code delivered by email.
 *   2. Phone          — 6-digit one-time code delivered by SMS.
 *   3. Government ID  — document submitted by the creator, approved/rejected by a reviewer.
 *
 * Completing all three earns the "Verified Creator" badge, which is synced onto
 * every campaign owned by the creator (`CampaignRecord.creatorVerification`) so
 * campaign pages, listings and search results can display it.
 *
 * Security / privacy properties:
 *   - Mutations require a short-lived creator session obtained by signing a
 *     server-issued challenge with the creator's Stellar wallet, so nobody can
 *     verify (or withdraw) on behalf of another address.
 *   - One-time codes are stored only as salted SHA-256 hashes, expire after
 *     10 minutes, allow at most 5 attempts and are rate limited on resend.
 *   - Raw email addresses / phone numbers are not retained after a challenge
 *     completes; only a masked form is kept for the creator's own dashboard.
 *   - Government ID documents are referenced by upload key only; the public
 *     API exposes the review outcome, never the document.
 */
import { Buffer } from "node:buffer";
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  CREATOR_VERIFICATION_STEPS,
  GOVERNMENT_ID_DOCUMENT_TYPES,
  maskEmail,
  maskPhone,
  summarizeCreatorVerification,
  type CampaignVerificationSummary,
  type CreatorVerificationStep,
  type CreatorVerificationStepStatus,
  type GovernmentIdDocumentType,
} from "@/lib/creator-verification";
import { creatorIdentityKeyPrefix } from "@/lib/s3/keys";
import { EmailService } from "./email.service";
import { getCampaignDataSource, type CampaignDataSource } from "./campaign.service";

export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
export const VERIFICATION_CODE_MAX_ATTEMPTS = 5;
export const VERIFICATION_CODE_RESEND_COOLDOWN_MS = 60 * 1000;
export const CREATOR_SESSION_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const CREATOR_SESSION_TTL_MS = 60 * 60 * 1000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** E.164: leading "+", country code 1-9, up to 15 digits total. */
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const ISO_COUNTRY_PATTERN = /^[A-Z]{2}$/;
const DOCUMENT_REFERENCE_PATTERN = /^[A-Za-z0-9._:/-]{4,256}$/;
const CODE_PATTERN = /^\d{6}$/;
/** SEP-53 prefix used by wallets (e.g. Freighter) when signing arbitrary messages. */
const SEP53_MESSAGE_PREFIX = "Stellar Signed Message:\n";

export type CreatorVerificationErrorCode =
  | "INVALID_INPUT"
  | "INVALID_ADDRESS"
  | "NO_PENDING_CHALLENGE"
  | "CHALLENGE_EXPIRED"
  | "INVALID_CODE"
  | "TOO_MANY_ATTEMPTS"
  | "RATE_LIMITED"
  | "INVALID_STATE"
  | "NOT_FOUND"
  | "DELIVERY_FAILED";

const ERROR_STATUS: Record<CreatorVerificationErrorCode, number> = {
  INVALID_INPUT: 400,
  INVALID_ADDRESS: 400,
  NO_PENDING_CHALLENGE: 409,
  CHALLENGE_EXPIRED: 410,
  INVALID_CODE: 400,
  TOO_MANY_ATTEMPTS: 429,
  RATE_LIMITED: 429,
  INVALID_STATE: 409,
  NOT_FOUND: 404,
  DELIVERY_FAILED: 502,
};

export class CreatorVerificationError extends Error {
  readonly status: number;
  constructor(readonly code: CreatorVerificationErrorCode, message: string) {
    super(message);
    this.name = "CreatorVerificationError";
    this.status = ERROR_STATUS[code];
  }
}

interface CodeChallenge {
  codeHash: string;
  salt: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
}

interface ContactStepState {
  status: CreatorVerificationStepStatus;
  /** Masked destination (e.g. `j•••e@example.org`), shown only to the creator. */
  maskedTarget?: string;
  /** Salted hash of the normalised destination; lets us detect re-verification of the same contact. */
  targetHash?: string;
  verifiedAt?: number;
  challenge?: CodeChallenge;
}

interface GovernmentIdStepState {
  status: CreatorVerificationStepStatus;
  documentType?: GovernmentIdDocumentType;
  issuingCountry?: string;
  /** Storage key of the uploaded document (from /api/presign-upload). Never exposed publicly. */
  documentReference?: string;
  submittedAt?: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectionReason?: string;
  verifiedAt?: number;
}

interface CreatorIdentityRecord {
  creator: string;
  email: ContactStepState;
  phone: ContactStepState;
  governmentId: GovernmentIdStepState;
  createdAt: number;
  updatedAt: number;
  /** When the creator first held all three verifications (badge earned). */
  verifiedAt?: number;
}

/** Per-step view returned to the creator (owner view) — masked, no secrets. */
export interface CreatorVerificationStepView {
  step: CreatorVerificationStep;
  status: CreatorVerificationStepStatus;
  verifiedAt?: number;
  maskedTarget?: string;
  expiresAt?: number;
  documentType?: GovernmentIdDocumentType;
  issuingCountry?: string;
  submittedAt?: number;
  rejectionReason?: string;
}

/** Public status view: safe to show to anyone (backers, search, campaign pages). */
export interface CreatorVerificationStatusView {
  creator: string;
  summary: CampaignVerificationSummary;
  steps: Array<Pick<CreatorVerificationStepView, "step" | "status" | "verifiedAt">>;
}

/** Owner view: includes masked destinations, pending expiry and rejection reasons. */
export interface CreatorVerificationOwnerView extends CreatorVerificationStatusView {
  steps: CreatorVerificationStepView[];
}

export interface PendingGovernmentIdReview {
  creator: string;
  documentType: GovernmentIdDocumentType;
  issuingCountry: string;
  documentReference: string;
  submittedAt: number;
}

export interface CodeDispatchResult {
  step: "email" | "phone";
  status: "pending";
  maskedTarget: string;
  expiresAt: number;
  /** Only populated when CREATOR_VERIFICATION_DEV_CODES=true outside production. */
  devCode?: string;
}

export interface CreatorVerificationDependencies {
  now?: () => number;
  generateCode?: () => string;
  sendEmailCode?: (to: string, code: string) => Promise<boolean>;
  sendSmsCode?: (to: string, code: string) => Promise<boolean>;
  /** Called whenever the public summary changes, e.g. to sync campaigns / search indexes. */
  onSummaryChange?: (creator: string, summary: CampaignVerificationSummary) => Promise<void>;
  /** Whether to echo the one-time code in API responses (local development only). */
  exposeDevCodes?: boolean;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function decodeSignature(value: string): Buffer | null {
  const trimmed = value.trim();
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (/^[\da-f]{128}$/i.test(hex)) return Buffer.from(hex, "hex");
  const signature = Buffer.from(trimmed, "base64");
  return signature.length === 64 ? signature : null;
}

/** Normalises a Stellar address and throws when it is not a valid ed25519 public key. */
export function normalizeCreatorAddress(address: unknown): string {
  const value = typeof address === "string" ? address.trim() : "";
  if (!StrKey.isValidEd25519PublicKey(value)) {
    throw new CreatorVerificationError("INVALID_ADDRESS", "A valid Stellar public key (G...) is required");
  }
  return value;
}

export function normalizeEmail(email: unknown): string {
  const value = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!value || value.length > 254 || !EMAIL_PATTERN.test(value)) {
    throw new CreatorVerificationError("INVALID_INPUT", "A valid email address is required");
  }
  return value;
}

export function normalizePhone(phone: unknown): string {
  const value = typeof phone === "string" ? phone.replace(/[\s().-]/g, "") : "";
  if (!E164_PATTERN.test(value)) {
    throw new CreatorVerificationError("INVALID_INPUT", "Phone number must be in international E.164 format, e.g. +2348012345678");
  }
  return value;
}

function defaultExposeDevCodes(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.CREATOR_VERIFICATION_DEV_CODES === "true";
}

function emptyRecord(creator: string, now: number): CreatorIdentityRecord {
  return {
    creator,
    email: { status: "not_started" },
    phone: { status: "not_started" },
    governmentId: { status: "not_started" },
    createdAt: now,
    updatedAt: now,
  };
}

export class CreatorIdentityVerificationService {
  private readonly records = new Map<string, CreatorIdentityRecord>();
  private readonly sessionChallenges = new Map<string, { creator: string; message: string; expiresAt: number }>();
  private readonly sessions = new Map<string, { creator: string; expiresAt: number }>();
  private readonly now: () => number;
  private readonly generateCode: () => string;
  private readonly sendEmailCode: (to: string, code: string) => Promise<boolean>;
  private readonly sendSmsCode: (to: string, code: string) => Promise<boolean>;
  private readonly onSummaryChange?: (creator: string, summary: CampaignVerificationSummary) => Promise<void>;
  private readonly exposeDevCodes: () => boolean;

  constructor(deps: CreatorVerificationDependencies = {}) {
    this.now = deps.now ?? Date.now;
    this.generateCode = deps.generateCode ?? (() => String(randomInt(0, 1_000_000)).padStart(6, "0"));
    this.sendEmailCode =
      deps.sendEmailCode ??
      ((to, code) =>
        new EmailService().sendEmail({
          to,
          subject: "Your Fundable creator verification code",
          html: `<p>Use the code below to verify your email address for your Fundable creator profile. It expires in 10 minutes.</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>If you did not request this, you can ignore this email.</p>`,
        }));
    this.sendSmsCode =
      deps.sendSmsCode ??
      (async (to) => {
        // Mock SMS gateway (mirrors EmailService). Never log the code itself.
        console.log(`[SmsService] Sending creator verification code to ${maskPhone(to)}`);
        return true;
      });
    this.onSummaryChange = deps.onSummaryChange;
    this.exposeDevCodes = deps.exposeDevCodes !== undefined ? () => Boolean(deps.exposeDevCodes) : defaultExposeDevCodes;
  }

  // ---------------------------------------------------------------------------
  // Creator wallet sessions (proof of address ownership)
  // ---------------------------------------------------------------------------

  /** Issues a message the creator must sign with their Stellar wallet. */
  issueSessionChallenge(address: unknown): { nonce: string; message: string; expiresAt: number } {
    const creator = normalizeCreatorAddress(address);
    const now = this.now();
    this.cleanupSessions(now);
    const nonce = randomUUID();
    const message = [
      "Fundable creator identity verification",
      `Address: ${creator}`,
      `Nonce: ${nonce}`,
    ].join("\n");
    const expiresAt = now + CREATOR_SESSION_CHALLENGE_TTL_MS;
    this.sessionChallenges.set(nonce, { creator, message, expiresAt });
    return { nonce, message, expiresAt };
  }

  /**
   * Verifies the signed challenge and returns a session token. Accepts raw
   * ed25519 signatures over the message as well as SEP-53 signatures (the
   * format produced by wallet `signMessage` APIs such as Freighter).
   */
  verifySessionChallenge(input: { address: unknown; nonce: unknown; signature: unknown }): { token: string; expiresAt: number } | null {
    const now = this.now();
    this.cleanupSessions(now);
    if (typeof input.nonce !== "string" || typeof input.signature !== "string") return null;
    const challenge = this.sessionChallenges.get(input.nonce);
    this.sessionChallenges.delete(input.nonce);
    if (!challenge || challenge.expiresAt <= now) return null;

    let creator: string;
    try {
      creator = normalizeCreatorAddress(input.address);
    } catch {
      return null;
    }
    if (creator !== challenge.creator) return null;

    const signature = decodeSignature(input.signature);
    if (!signature) return null;
    try {
      const keypair = Keypair.fromPublicKey(creator);
      const raw = Buffer.from(challenge.message, "utf8");
      const sep53 = createHash("sha256").update(Buffer.concat([Buffer.from(SEP53_MESSAGE_PREFIX, "utf8"), raw])).digest();
      if (!keypair.verify(raw, signature) && !keypair.verify(sep53, signature)) return null;
    } catch {
      return null;
    }

    const token = randomUUID();
    const expiresAt = now + CREATOR_SESSION_TTL_MS;
    this.sessions.set(token, { creator, expiresAt });
    return { token, expiresAt };
  }

  /** Returns the creator address bound to a session token, or null when invalid/expired. */
  resolveSession(token: string | null | undefined): string | null {
    if (!token) return null;
    const now = this.now();
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= now) {
      this.sessions.delete(token);
      return null;
    }
    return session.creator;
  }

  private cleanupSessions(now: number): void {
    for (const [nonce, challenge] of this.sessionChallenges) if (challenge.expiresAt <= now) this.sessionChallenges.delete(nonce);
    for (const [token, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(token);
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  /** Public summary for a creator; unknown creators are `unverified`. */
  getSummary(address: string): CampaignVerificationSummary {
    const record = this.records.get(address.trim());
    if (!record) return summarizeCreatorVerification();
    return this.summaryOf(record);
  }

  /** True when the service holds verification data for this creator. */
  hasRecord(address: string): boolean {
    return this.records.has(address.trim());
  }

  getPublicStatus(address: unknown): CreatorVerificationStatusView {
    const creator = normalizeCreatorAddress(address);
    const owner = this.getOwnerStatus(creator);
    return {
      creator,
      summary: owner.summary,
      steps: owner.steps.map(({ step, status, verifiedAt }) => ({
        step,
        // Pending/rejected states are private to the creator; backers only see verified vs not.
        status: status === "verified" ? "verified" : "not_started",
        ...(verifiedAt !== undefined ? { verifiedAt } : {}),
      })),
    };
  }

  getOwnerStatus(address: unknown): CreatorVerificationOwnerView {
    const creator = normalizeCreatorAddress(address);
    const now = this.now();
    const record = this.records.get(creator) ?? emptyRecord(creator, now);
    const contactView = (step: "email" | "phone", state: ContactStepState): CreatorVerificationStepView => ({
      step,
      status: state.status,
      ...(state.verifiedAt !== undefined ? { verifiedAt: state.verifiedAt } : {}),
      ...(state.maskedTarget ? { maskedTarget: state.maskedTarget } : {}),
      ...(state.status === "pending" && state.challenge ? { expiresAt: state.challenge.expiresAt } : {}),
    });
    const gov = record.governmentId;
    const steps: CreatorVerificationStepView[] = [
      contactView("email", record.email),
      contactView("phone", record.phone),
      {
        step: "government_id",
        status: gov.status,
        ...(gov.verifiedAt !== undefined ? { verifiedAt: gov.verifiedAt } : {}),
        ...(gov.documentType ? { documentType: gov.documentType } : {}),
        ...(gov.issuingCountry ? { issuingCountry: gov.issuingCountry } : {}),
        ...(gov.submittedAt !== undefined ? { submittedAt: gov.submittedAt } : {}),
        ...(gov.status === "rejected" && gov.rejectionReason ? { rejectionReason: gov.rejectionReason } : {}),
      },
    ];
    // Keep step order canonical.
    steps.sort((a, b) => CREATOR_VERIFICATION_STEPS.indexOf(a.step) - CREATOR_VERIFICATION_STEPS.indexOf(b.step));
    return { creator, summary: this.summaryOf(record), steps };
  }

  private summaryOf(record: CreatorIdentityRecord): CampaignVerificationSummary {
    return summarizeCreatorVerification({
      emailVerified: record.email.status === "verified",
      phoneVerified: record.phone.status === "verified",
      governmentIdVerified: record.governmentId.status === "verified",
      verifiedAt: record.verifiedAt,
    });
  }

  // ---------------------------------------------------------------------------
  // Email & phone (one-time codes)
  // ---------------------------------------------------------------------------

  async startEmailVerification(address: unknown, email: unknown): Promise<CodeDispatchResult> {
    const target = normalizeEmail(email);
    return this.startContactVerification(address, "email", target, maskEmail(target), this.sendEmailCode);
  }

  async confirmEmailVerification(address: unknown, code: unknown): Promise<CreatorVerificationOwnerView> {
    return this.confirmContactVerification(address, "email", code);
  }

  async startPhoneVerification(address: unknown, phone: unknown): Promise<CodeDispatchResult> {
    const target = normalizePhone(phone);
    return this.startContactVerification(address, "phone", target, maskPhone(target), this.sendSmsCode);
  }

  async confirmPhoneVerification(address: unknown, code: unknown): Promise<CreatorVerificationOwnerView> {
    return this.confirmContactVerification(address, "phone", code);
  }

  private async startContactVerification(
    address: unknown,
    step: "email" | "phone",
    target: string,
    maskedTarget: string,
    send: (to: string, code: string) => Promise<boolean>,
  ): Promise<CodeDispatchResult> {
    const creator = normalizeCreatorAddress(address);
    const now = this.now();
    const record = this.records.get(creator) ?? emptyRecord(creator, now);
    const state = record[step];
    const targetHash = sha256(`${creator}:${step}:${target}`);

    if (state.status === "verified" && state.targetHash === targetHash) {
      throw new CreatorVerificationError("INVALID_STATE", `This ${step === "email" ? "email address" : "phone number"} is already verified`);
    }
    if (state.challenge && now - state.challenge.sentAt < VERIFICATION_CODE_RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((VERIFICATION_CODE_RESEND_COOLDOWN_MS - (now - state.challenge.sentAt)) / 1000);
      throw new CreatorVerificationError("RATE_LIMITED", `Please wait ${waitSeconds}s before requesting another code`);
    }

    const code = this.generateCode();
    if (!CODE_PATTERN.test(code)) throw new Error("Verification code generator must return 6 digits");
    let delivered = false;
    try {
      delivered = await send(target, code);
    } catch {
      delivered = false;
    }
    if (!delivered) {
      throw new CreatorVerificationError("DELIVERY_FAILED", `Could not deliver the verification code by ${step === "email" ? "email" : "SMS"}`);
    }

    const salt = randomUUID();
    const challenge: CodeChallenge = {
      codeHash: sha256(`${salt}:${code}`),
      salt,
      expiresAt: now + VERIFICATION_CODE_TTL_MS,
      attempts: 0,
      sentAt: now,
    };
    const wasVerified = state.status === "verified";
    // Starting verification of a NEW contact replaces the previous verification for that step.
    record[step] = { status: "pending", maskedTarget, targetHash, challenge };
    record.updatedAt = now;
    this.records.set(creator, record);
    if (wasVerified) await this.handleSummaryChange(record);

    return {
      step,
      status: "pending",
      maskedTarget,
      expiresAt: challenge.expiresAt,
      ...(this.exposeDevCodes() ? { devCode: code } : {}),
    };
  }

  private async confirmContactVerification(address: unknown, step: "email" | "phone", code: unknown): Promise<CreatorVerificationOwnerView> {
    const creator = normalizeCreatorAddress(address);
    const now = this.now();
    const record = this.records.get(creator);
    const state = record?.[step];
    if (!record || !state || state.status !== "pending" || !state.challenge) {
      throw new CreatorVerificationError("NO_PENDING_CHALLENGE", `Request a new ${step} verification code first`);
    }
    const challenge = state.challenge;
    if (challenge.expiresAt <= now) {
      record[step] = { status: "not_started" };
      record.updatedAt = now;
      throw new CreatorVerificationError("CHALLENGE_EXPIRED", "The verification code has expired. Request a new one");
    }
    if (challenge.attempts >= VERIFICATION_CODE_MAX_ATTEMPTS) {
      throw new CreatorVerificationError("TOO_MANY_ATTEMPTS", "Too many incorrect attempts. Request a new code");
    }
    const normalizedCode = typeof code === "string" ? code.trim() : typeof code === "number" ? String(code).padStart(6, "0") : "";
    if (!CODE_PATTERN.test(normalizedCode)) {
      throw new CreatorVerificationError("INVALID_INPUT", "The verification code must be 6 digits");
    }
    challenge.attempts += 1;
    if (!safeEqualHex(sha256(`${challenge.salt}:${normalizedCode}`), challenge.codeHash)) {
      record.updatedAt = now;
      const remaining = VERIFICATION_CODE_MAX_ATTEMPTS - challenge.attempts;
      throw new CreatorVerificationError(
        remaining > 0 ? "INVALID_CODE" : "TOO_MANY_ATTEMPTS",
        remaining > 0 ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining` : "Too many incorrect attempts. Request a new code",
      );
    }

    record[step] = { status: "verified", maskedTarget: state.maskedTarget, targetHash: state.targetHash, verifiedAt: now };
    record.updatedAt = now;
    await this.handleSummaryChange(record);
    return this.getOwnerStatus(creator);
  }

  // ---------------------------------------------------------------------------
  // Government ID (document + manual review)
  // ---------------------------------------------------------------------------

  async submitGovernmentId(
    address: unknown,
    input: { documentType?: unknown; issuingCountry?: unknown; documentReference?: unknown },
  ): Promise<CreatorVerificationOwnerView> {
    const creator = normalizeCreatorAddress(address);
    const documentType = input.documentType;
    if (typeof documentType !== "string" || !(GOVERNMENT_ID_DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
      throw new CreatorVerificationError("INVALID_INPUT", `documentType must be one of ${GOVERNMENT_ID_DOCUMENT_TYPES.join(", ")}`);
    }
    const issuingCountry = typeof input.issuingCountry === "string" ? input.issuingCountry.trim().toUpperCase() : "";
    if (!ISO_COUNTRY_PATTERN.test(issuingCountry)) {
      throw new CreatorVerificationError("INVALID_INPUT", "issuingCountry must be an ISO 3166-1 alpha-2 code, e.g. NG");
    }
    const documentReference = typeof input.documentReference === "string" ? input.documentReference.trim() : "";
    if (
      !DOCUMENT_REFERENCE_PATTERN.test(documentReference) ||
      documentReference.includes("..") ||
      !documentReference.startsWith(creatorIdentityKeyPrefix(creator))
    ) {
      throw new CreatorVerificationError(
        "INVALID_INPUT",
        "documentReference must be the storage key returned by /api/creators/:address/verification/government-id/upload",
      );
    }

    const now = this.now();
    const record = this.records.get(creator) ?? emptyRecord(creator, now);
    if (record.governmentId.status === "verified") {
      throw new CreatorVerificationError("INVALID_STATE", "Your government ID is already verified");
    }
    if (record.governmentId.status === "pending") {
      throw new CreatorVerificationError("INVALID_STATE", "Your government ID is already awaiting review");
    }
    record.governmentId = {
      status: "pending",
      documentType: documentType as GovernmentIdDocumentType,
      issuingCountry,
      documentReference,
      submittedAt: now,
    };
    record.updatedAt = now;
    this.records.set(creator, record);
    return this.getOwnerStatus(creator);
  }

  /** Admin-only: approve or reject a pending government ID. Callers must authorize first. */
  async reviewGovernmentId(
    address: unknown,
    input: { decision?: unknown; reviewer?: unknown; reason?: unknown },
  ): Promise<CreatorVerificationOwnerView> {
    const creator = normalizeCreatorAddress(address);
    if (input.decision !== "approve" && input.decision !== "reject") {
      throw new CreatorVerificationError("INVALID_INPUT", 'decision must be "approve" or "reject"');
    }
    const reviewer = typeof input.reviewer === "string" ? input.reviewer.trim() : "";
    if (!reviewer) throw new CreatorVerificationError("INVALID_INPUT", "reviewer is required");
    const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : "";
    if (input.decision === "reject" && !reason) {
      throw new CreatorVerificationError("INVALID_INPUT", "A reason is required when rejecting a government ID");
    }

    const record = this.records.get(creator);
    if (!record || record.governmentId.status !== "pending") {
      throw new CreatorVerificationError("NOT_FOUND", "No government ID is awaiting review for this creator");
    }
    const now = this.now();
    record.governmentId =
      input.decision === "approve"
        ? {
            ...record.governmentId,
            status: "verified",
            reviewedAt: now,
            reviewedBy: reviewer,
            verifiedAt: now,
            rejectionReason: undefined,
          }
        : {
            ...record.governmentId,
            status: "rejected",
            reviewedAt: now,
            reviewedBy: reviewer,
            rejectionReason: reason,
            verifiedAt: undefined,
          };
    record.updatedAt = now;
    await this.handleSummaryChange(record);
    return this.getOwnerStatus(creator);
  }

  /** Admin-only: government IDs awaiting review, oldest first. */
  listPendingGovernmentIdReviews(): PendingGovernmentIdReview[] {
    return Array.from(this.records.values())
      .filter((record) => record.governmentId.status === "pending")
      .map((record) => ({
        creator: record.creator,
        documentType: record.governmentId.documentType as GovernmentIdDocumentType,
        issuingCountry: record.governmentId.issuingCountry as string,
        documentReference: record.governmentId.documentReference as string,
        submittedAt: record.governmentId.submittedAt as number,
      }))
      .sort((a, b) => a.submittedAt - b.submittedAt);
  }

  // ---------------------------------------------------------------------------
  // Opt-out
  // ---------------------------------------------------------------------------

  /** Verification is optional: creators may withdraw at any time, erasing all stored verification data. */
  async withdraw(address: unknown): Promise<CreatorVerificationStatusView> {
    const creator = normalizeCreatorAddress(address);
    const record = this.records.get(creator);
    if (record) {
      this.records.delete(creator);
      await this.notify(creator, summarizeCreatorVerification());
    }
    return this.getPublicStatus(creator);
  }

  private async handleSummaryChange(record: CreatorIdentityRecord): Promise<void> {
    const before = record.verifiedAt;
    const allVerified =
      record.email.status === "verified" && record.phone.status === "verified" && record.governmentId.status === "verified";
    record.verifiedAt = allVerified ? before ?? this.now() : undefined;
    await this.notify(record.creator, this.summaryOf(record));
  }

  private async notify(creator: string, summary: CampaignVerificationSummary): Promise<void> {
    if (!this.onSummaryChange) return;
    try {
      await this.onSummaryChange(creator, summary);
    } catch (error) {
      // Syncing is best-effort; read-time enrichment keeps search/listings correct regardless.
      console.error(`[CreatorVerification] Failed to sync verification for ${creator}:`, error);
    }
  }

  /** Test helper. */
  reset(): void {
    this.records.clear();
    this.sessionChallenges.clear();
    this.sessions.clear();
  }
}

/**
 * Copies a creator's public verification summary onto every campaign they own
 * so persisted records (and any external search index fed from them) carry the
 * badge state.
 */
export async function syncCreatorVerificationToCampaigns(
  creator: string,
  summary: CampaignVerificationSummary,
  dataSource: CampaignDataSource = getCampaignDataSource(),
): Promise<number> {
  const campaigns = (await dataSource.getCampaigns()).filter((campaign) => campaign.creator === creator);
  for (const campaign of campaigns) {
    await dataSource.saveCampaign({ ...campaign, creatorVerification: summary });
  }
  return campaigns.length;
}

export const creatorIdentityVerificationService = new CreatorIdentityVerificationService({
  onSummaryChange: (creator, summary) => syncCreatorVerificationToCampaigns(creator, summary).then(() => undefined),
});

/**
 * Overlays the live verification summary onto a campaign. Campaigns whose
 * creator has no record in the verification service keep whatever summary is
 * already persisted on the record (e.g. imported or indexed data).
 */
export function withCreatorVerification<T extends { creator: string; creatorVerification?: CampaignVerificationSummary }>(
  campaign: T,
  service: CreatorIdentityVerificationService = creatorIdentityVerificationService,
): T & { creatorVerification: CampaignVerificationSummary } {
  const summary = service.hasRecord(campaign.creator)
    ? service.getSummary(campaign.creator)
    : summarizeCreatorVerification(campaign.creatorVerification ?? {});
  return { ...campaign, creatorVerification: summary };
}

/** Resolver signature used by the search provider. */
export function resolveCreatorVerification(
  campaign: { creator: string; creatorVerification?: CampaignVerificationSummary },
): CampaignVerificationSummary {
  return withCreatorVerification(campaign).creatorVerification;
}

/** Extracts a bearer session token from the request. */
export function creatorSessionToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;
  return match ? match[1].trim() : null;
}
