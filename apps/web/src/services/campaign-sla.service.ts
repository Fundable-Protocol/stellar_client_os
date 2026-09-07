/**
 * Campaign Verification SLA Service — issue #742
 *
 * Implements and enforces Fundable's 30-day Tree Verification Service Level Agreement (SLA).
 *
 * Guarantee Policy:
 *   - All planted tree batches must be independently verified on-chain (via satellite/photo evidence)
 *     within 30 days of planting.
 *   - If the verification deadline passes without proof verification, sponsors are automatically
 *     eligible for a 100% principal refund.
 */

export interface VerificationSlaRecord {
  campaignId: string;
  plantingId: string;
  planterAddress: string;
  treeCount: number;
  plantedAtTimestamp: number;
  /** Verification deadline timestamp = plantedAtTimestamp + 30 days (2,592,000s). */
  verificationDeadlineTimestamp: number;
  isVerified: boolean;
  verifiedAtTimestamp?: number;
  isSlaBreached: boolean;
  isRefundEligible: boolean;
  daysRemaining: number;
  slaGuaranteeDays: number;
}

export interface VerificationSlaGuaranteePolicy {
  guaranteeTitle: string;
  guaranteePeriodDays: number;
  guaranteeDescription: string;
  autoRefundPolicy: string;
  remedyAction: string;
}

export const VERIFICATION_SLA_DAYS = 30;
export const VERIFICATION_SLA_SECONDS = VERIFICATION_SLA_DAYS * 24 * 60 * 60; // 2,592,000s

export const PUBLISHED_SLA_GUARANTEE_POLICY: VerificationSlaGuaranteePolicy = {
  guaranteeTitle: "30-Day Tree Verification SLA Guarantee",
  guaranteePeriodDays: VERIFICATION_SLA_DAYS,
  guaranteeDescription:
    "Fundable commits to independently verifying all tree planting batches on-chain via multi-modal verification (satellite telemetry and cryptographically hashed photos) within 30 calendar days of initial planting.",
  autoRefundPolicy:
    "If verification proof is not published and validated on-chain within 30 days of planting, sponsors are granted automatic principal refund rights for unverified batches.",
  remedyAction: "Immediate 100% auto-refund of escrowed sponsorship funds upon SLA deadline expiry.",
};

/**
 * Calculates SLA verification status, countdown, and refund eligibility for a tree planting record.
 */
export function evaluatePlantingSla(
  campaignId: string,
  plantingId: string,
  planterAddress: string,
  treeCount: number,
  plantedAtTimestamp: number,
  isVerified: boolean,
  verifiedAtTimestamp?: number,
  nowTimestamp: number = Math.floor(Date.now() / 1000)
): VerificationSlaRecord {
  const deadline = plantedAtTimestamp + VERIFICATION_SLA_SECONDS;
  const isExpired = nowTimestamp > deadline;
  const isSlaBreached = !isVerified && isExpired;
  const isRefundEligible = isSlaBreached;

  const secondsRemaining = Math.max(0, deadline - nowTimestamp);
  const daysRemaining = isVerified
    ? 0
    : Number((secondsRemaining / (24 * 3600)).toFixed(1));

  return {
    campaignId,
    plantingId,
    planterAddress,
    treeCount,
    plantedAtTimestamp,
    verificationDeadlineTimestamp: deadline,
    isVerified,
    verifiedAtTimestamp,
    isSlaBreached,
    isRefundEligible,
    daysRemaining,
    slaGuaranteeDays: VERIFICATION_SLA_DAYS,
  };
}

/**
 * Fetch campaign verification SLA status by campaign ID and planting ID.
 */
export async function getCampaignVerificationSla(
  campaignId: string,
  plantingId = "1"
): Promise<{
  policy: VerificationSlaGuaranteePolicy;
  record: VerificationSlaRecord;
}> {
  const now = Math.floor(Date.now() / 1000);
  // Default mock/demo planting record relative to current time for display
  const plantedAt = now - 12 * 24 * 3600; // 12 days ago

  const record = evaluatePlantingSla(
    campaignId,
    plantingId,
    "GPLANTER1111111111111111111111111111111111111111111111",
    250,
    plantedAt,
    false,
    undefined,
    now
  );

  return {
    policy: PUBLISHED_SLA_GUARANTEE_POLICY,
    record,
  };
}
