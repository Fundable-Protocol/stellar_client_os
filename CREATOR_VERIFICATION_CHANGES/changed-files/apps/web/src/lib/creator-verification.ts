/**
 * Creator identity verification — shared, client-safe model.
 *
 * Verification is OPTIONAL for campaign creators. Each completed step earns
 * trust signals for backers, and completing all three steps (email, phone and
 * government ID) earns the "Verified Creator" badge that is displayed on
 * campaign cards, the campaign detail page and in search results.
 *
 * This module is intentionally free of server-only imports so it can be used
 * by React client components as well as API routes and services.
 * See docs/creator-identity-verification.md for the full flow.
 */

/** Ordered verification steps. The order is the recommended completion order. */
export const CREATOR_VERIFICATION_STEPS = ["email", "phone", "government_id"] as const;
export type CreatorVerificationStep = (typeof CREATOR_VERIFICATION_STEPS)[number];

/**
 * Lifecycle of a single step:
 * - `not_started`: the creator has not attempted the step (default; verification is optional).
 * - `pending`: a one-time code was sent (email/phone) or a document awaits review (government ID).
 * - `verified`: the step was completed successfully.
 * - `rejected`: a reviewer rejected the submitted government ID; the creator may resubmit.
 */
export type CreatorVerificationStepStatus = "not_started" | "pending" | "verified" | "rejected";

/** Overall verification level derived from the number of verified steps. */
export type CreatorVerificationLevel = "verified" | "partial" | "unverified";

export const GOVERNMENT_ID_DOCUMENT_TYPES = ["passport", "national_id", "drivers_license"] as const;
export type GovernmentIdDocumentType = (typeof GOVERNMENT_ID_DOCUMENT_TYPES)[number];

export const VERIFIED_CREATOR_BADGE_LABEL = "Verified Creator";

export interface CreatorVerificationStepDetail {
  step: CreatorVerificationStep;
  label: string;
  /** Short badge label shown on the per-step chips. */
  badgeLabel: string;
  description: string;
}

/** Human-readable descriptions used by the wizard UI and mirrored in the docs. */
export const CREATOR_VERIFICATION_STEP_DETAILS: Record<CreatorVerificationStep, CreatorVerificationStepDetail> = {
  email: {
    step: "email",
    label: "Verify your email address",
    badgeLabel: "Email",
    description: "We send a 6-digit code to your email address. Enter it within 10 minutes to confirm you own the inbox.",
  },
  phone: {
    step: "phone",
    label: "Verify your phone number",
    badgeLabel: "Phone",
    description: "We send a 6-digit code by SMS to your phone number (international E.164 format, e.g. +2348012345678).",
  },
  government_id: {
    step: "government_id",
    label: "Verify your government ID",
    badgeLabel: "Government ID",
    description:
      "Upload a passport, national ID card or driver's licence. A Fundable reviewer confirms it matches your profile; only the review outcome is shown publicly.",
  },
};

/**
 * Public verification summary attached to campaigns (`CampaignRecord.creatorVerification`)
 * and returned by the search / campaign APIs. It never contains personal data.
 */
export interface CampaignVerificationSummary {
  emailVerified: boolean;
  phoneVerified: boolean;
  governmentIdVerified: boolean;
  /**
   * @deprecated Postal address verification was replaced by government ID
   * verification. Kept so existing API/GraphQL consumers keep their response
   * shape; it no longer counts towards the verification level.
   */
  addressVerified: boolean;
  /** Legacy aliases kept for backwards compatibility. */
  verifiedEmail?: boolean;
  verifiedPhone?: boolean;
  verifiedGovernmentId?: boolean;
  verifiedAddress?: boolean;
  /** Verified step identifiers, in canonical order (e.g. `["email", "phone"]`). */
  badges: string[];
  status: CreatorVerificationLevel;
  /** True only when every step is verified — the "Verified Creator" badge. */
  isVerified: boolean;
  verifiedCount: number;
  totalCount: number;
  /** Timestamp (ms) at which the creator earned the full badge, if they have. */
  verifiedAt?: number;
}

export type CreatorVerificationFlags = Partial<
  Pick<CampaignVerificationSummary, "emailVerified" | "phoneVerified" | "governmentIdVerified" | "addressVerified" | "verifiedAt">
> & { verifiedGovernmentId?: boolean; verifiedEmail?: boolean; verifiedPhone?: boolean };

/** Builds the canonical public summary from raw per-step flags. */
export function summarizeCreatorVerification(flags: CreatorVerificationFlags = {}): CampaignVerificationSummary {
  const emailVerified = Boolean(flags.emailVerified ?? flags.verifiedEmail ?? false);
  const phoneVerified = Boolean(flags.phoneVerified ?? flags.verifiedPhone ?? false);
  const governmentIdVerified = Boolean(flags.governmentIdVerified ?? flags.verifiedGovernmentId ?? false);
  const addressVerified = Boolean(flags.addressVerified ?? false);

  const stepFlags: Record<CreatorVerificationStep, boolean> = {
    email: emailVerified,
    phone: phoneVerified,
    government_id: governmentIdVerified,
  };
  const badges = CREATOR_VERIFICATION_STEPS.filter((step) => stepFlags[step]);
  const verifiedCount = badges.length;
  const totalCount = CREATOR_VERIFICATION_STEPS.length;
  const isVerified = verifiedCount === totalCount;
  const status: CreatorVerificationLevel = isVerified ? "verified" : verifiedCount > 0 ? "partial" : "unverified";

  return {
    emailVerified,
    phoneVerified,
    governmentIdVerified,
    addressVerified,
    verifiedEmail: emailVerified,
    verifiedPhone: phoneVerified,
    verifiedGovernmentId: governmentIdVerified,
    verifiedAddress: addressVerified,
    badges: [...badges],
    status,
    isVerified,
    verifiedCount,
    totalCount,
    ...(isVerified && flags.verifiedAt !== undefined ? { verifiedAt: flags.verifiedAt } : {}),
  };
}

/** Anything that may carry a verification summary (campaign records, API payloads, UI models). */
export interface CreatorVerificationCarrier {
  creatorVerification?: CreatorVerificationFlags | null;
  verification?: CreatorVerificationFlags | null;
}

/** Resolves the summary for a campaign-like object; campaigns without data are `unverified`. */
export function getVerificationSummaryFor(carrier: CreatorVerificationCarrier | null | undefined): CampaignVerificationSummary {
  return summarizeCreatorVerification(carrier?.creatorVerification ?? carrier?.verification ?? {});
}

/** Short, backer-facing description of a summary, e.g. "Verified Creator" or "2 of 3 identity checks". */
export function describeVerification(summary: Pick<CampaignVerificationSummary, "status" | "verifiedCount" | "totalCount">): string {
  if (summary.status === "verified") return VERIFIED_CREATOR_BADGE_LABEL;
  if (summary.status === "partial") return `${summary.verifiedCount} of ${summary.totalCount} identity checks`;
  return "Identity not verified";
}

/** Rank used to order results: verified creators first, then partially verified. */
export function verificationRank(summary: Pick<CampaignVerificationSummary, "status">): number {
  return summary.status === "verified" ? 2 : summary.status === "partial" ? 1 : 0;
}

/** Masks an email address for display, e.g. `jane.doe@example.org` → `j•••e@example.org`. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "•••";
  const visible = local.length <= 2 ? local[0] : `${local[0]}•••${local[local.length - 1]}`;
  return `${local.length <= 2 ? `${visible}•••` : visible}@${domain}`;
}

/** Masks a phone number for display, keeping only the last 4 digits. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 4 ? "•••" : `+•••${digits.slice(-4)}`;
}
