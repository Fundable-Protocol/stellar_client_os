/**
 * subscription-cadence.ts — Billing-cadence math for the Recurring Backer
 * Program (issue #781).
 *
 * Deliberately scoped to pure, chain-independent logic only. This module
 * has no dependency on @fundable/sdk, Soroban, or any network call, so it
 * can be unit tested in isolation and reused by both the subscription
 * creation form and any future renewal-reminder/cron job.
 *
 * NOT in scope here (see PR description): the actual recurring charge
 * itself. Fundable already has an audited `payment-stream` contract
 * (contracts/payment-stream) capable of moving funds from backer to
 * creator over a fixed duration — the intent is for a subscription to
 * create one `payment-stream` per billing cycle rather than introduce new
 * on-chain auto-debit logic, which is a materially larger and higher-risk
 * change that needs its own design discussion with a maintainer before any
 * code is written against it.
 */

export type BillingCadence = 'monthly' | 'quarterly';

export const CADENCE_MONTHS: Record<BillingCadence, number> = {
  monthly: 1,
  quarterly: 3,
};

export interface SubscriptionInput {
  cadence: BillingCadence;
  /** Amount per billing cycle, in the asset's smallest unit (matches the
   *  i128 stroop/smallest-unit convention used by the payment-stream
   *  contract's `create_stream`, not a floating-point display amount). */
  amountPerCycle: bigint;
  /** Unix ms timestamp of the first charge. Defaults to "now" if omitted. */
  startAt?: number;
}

export class SubscriptionValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'SubscriptionValidationError';
    this.field = field;
  }
}

/**
 * Validate a subscription input. Throws SubscriptionValidationError with a
 * field-scoped message on the first problem found, rather than returning a
 * boolean — callers (e.g. a zod .refine or a form's submit handler) can
 * catch this and map `field` directly onto the input that failed.
 */
export function validateSubscriptionInput(input: SubscriptionInput): void {
  if (!(input.cadence in CADENCE_MONTHS)) {
    throw new SubscriptionValidationError(
      'cadence',
      `cadence must be one of: ${Object.keys(CADENCE_MONTHS).join(', ')}`
    );
  }
  if (typeof input.amountPerCycle !== 'bigint') {
    throw new SubscriptionValidationError('amountPerCycle', 'amountPerCycle must be a bigint');
  }
  if (input.amountPerCycle <= 0n) {
    throw new SubscriptionValidationError('amountPerCycle', 'amountPerCycle must be greater than zero');
  }
  if (input.startAt !== undefined) {
    if (!Number.isFinite(input.startAt)) {
      throw new SubscriptionValidationError('startAt', 'startAt must be a finite timestamp');
    }
    if (input.startAt < 0) {
      throw new SubscriptionValidationError('startAt', 'startAt cannot be negative');
    }
  }
}

/**
 * Add `months` calendar months to a UTC timestamp, clamping the day of
 * month rather than overflowing into the following month.
 *
 * e.g. Jan 31 + 1 month -> Feb 28/29 (clamped), not Mar 3.
 * This matters for subscription billing specifically: a backer who
 * subscribes on the 31st should still be billed near the end of every
 * month, not have their billing date drift forward over time the way naive
 * "add N * 30 days" or unclamped month arithmetic would cause.
 */
export function addCalendarMonthsUtc(timestampMs: number, months: number): number {
  const d = new Date(timestampMs);
  const targetMonthIndex = d.getUTCMonth() + months;
  const targetYear = d.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;

  const daysInTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d.getUTCDate(), daysInTargetMonth);

  return Date.UTC(
    targetYear,
    normalizedMonth,
    clampedDay,
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds()
  );
}

/**
 * Compute the next charge timestamp for a subscription, given the
 * timestamp of its most recent charge (or `startAt` if none yet).
 */
export function nextChargeAt(cadence: BillingCadence, lastChargedAt: number): number {
  return addCalendarMonthsUtc(lastChargedAt, CADENCE_MONTHS[cadence]);
}

/**
 * Whether a subscription is due to be charged as of `now` (defaults to the
 * current time). A subscription becomes due at, not strictly after, its
 * next charge timestamp.
 */
export function isDue(cadence: BillingCadence, lastChargedAt: number, now: number = Date.now()): boolean {
  return now >= nextChargeAt(cadence, lastChargedAt);
}

/** Human-readable cadence label for UI display. */
export function cadenceLabel(cadence: BillingCadence): string {
  return cadence === 'monthly' ? 'Monthly' : 'Quarterly';
}
