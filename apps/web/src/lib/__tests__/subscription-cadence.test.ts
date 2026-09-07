import { describe, it, expect } from 'vitest';
import {
  addCalendarMonthsUtc,
  nextChargeAt,
  isDue,
  validateSubscriptionInput,
  SubscriptionValidationError,
  cadenceLabel,
  CADENCE_MONTHS,
} from '../subscription-cadence';

describe('addCalendarMonthsUtc', () => {
  it('adds a simple month within the same year', () => {
    const jan15 = Date.UTC(2026, 0, 15);
    const feb15 = Date.UTC(2026, 1, 15);
    expect(addCalendarMonthsUtc(jan15, 1)).toBe(feb15);
  });

  it('rolls over into the next year', () => {
    const dec15 = Date.UTC(2026, 11, 15);
    const jan15NextYear = Date.UTC(2027, 0, 15);
    expect(addCalendarMonthsUtc(dec15, 1)).toBe(jan15NextYear);
  });

  it('clamps Jan 31 + 1 month to Feb 28 in a non-leap year', () => {
    const jan31 = Date.UTC(2026, 0, 31);
    const feb28 = Date.UTC(2026, 1, 28);
    expect(addCalendarMonthsUtc(jan31, 1)).toBe(feb28);
  });

  it('clamps Jan 31 + 1 month to Feb 29 in a leap year', () => {
    const jan31LeapYear = Date.UTC(2028, 0, 31);
    const feb29 = Date.UTC(2028, 1, 29);
    expect(addCalendarMonthsUtc(jan31LeapYear, 1)).toBe(feb29);
  });

  it('adds 3 months for a quarterly cadence', () => {
    const jan15 = Date.UTC(2026, 0, 15);
    const apr15 = Date.UTC(2026, 3, 15);
    expect(addCalendarMonthsUtc(jan15, 3)).toBe(apr15);
  });

  it('preserves the time of day', () => {
    const start = Date.UTC(2026, 0, 15, 14, 30, 45);
    const result = addCalendarMonthsUtc(start, 1);
    const resultDate = new Date(result);
    expect(resultDate.getUTCHours()).toBe(14);
    expect(resultDate.getUTCMinutes()).toBe(30);
    expect(resultDate.getUTCSeconds()).toBe(45);
  });

  it('does not drift the billing day across repeated month-end clamps', () => {
    // Jan 31 -> Feb 28 -> should go to Mar 28, not Mar 31 (drift bug) and
    // not stay clamped forever — each step is relative to the *previous
    // actual* charge date, matching how a real billing loop would call this
    // repeatedly with `lastChargedAt` from the prior cycle.
    let date = Date.UTC(2026, 0, 31);
    date = addCalendarMonthsUtc(date, 1); // -> Feb 28
    expect(new Date(date).getUTCDate()).toBe(28);
    date = addCalendarMonthsUtc(date, 1); // -> Mar 28
    expect(new Date(date).getUTCMonth()).toBe(2);
    expect(new Date(date).getUTCDate()).toBe(28);
  });
});

describe('nextChargeAt', () => {
  it('adds 1 month for monthly cadence', () => {
    const start = Date.UTC(2026, 0, 15);
    expect(nextChargeAt('monthly', start)).toBe(Date.UTC(2026, 1, 15));
  });

  it('adds 3 months for quarterly cadence', () => {
    const start = Date.UTC(2026, 0, 15);
    expect(nextChargeAt('quarterly', start)).toBe(Date.UTC(2026, 3, 15));
  });
});

describe('isDue', () => {
  it('is not due before the next charge date', () => {
    const lastCharged = Date.UTC(2026, 0, 15);
    const now = Date.UTC(2026, 1, 10); // before Feb 15
    expect(isDue('monthly', lastCharged, now)).toBe(false);
  });

  it('is due exactly at the next charge date', () => {
    const lastCharged = Date.UTC(2026, 0, 15);
    const now = Date.UTC(2026, 1, 15);
    expect(isDue('monthly', lastCharged, now)).toBe(true);
  });

  it('is due after the next charge date', () => {
    const lastCharged = Date.UTC(2026, 0, 15);
    const now = Date.UTC(2026, 2, 1);
    expect(isDue('monthly', lastCharged, now)).toBe(true);
  });

  it('defaults now to Date.now() when omitted', () => {
    const longAgo = Date.UTC(2000, 0, 1);
    expect(isDue('monthly', longAgo)).toBe(true);
  });
});

describe('validateSubscriptionInput', () => {
  it('accepts a valid monthly subscription', () => {
    expect(() =>
      validateSubscriptionInput({ cadence: 'monthly', amountPerCycle: 1000n })
    ).not.toThrow();
  });

  it('accepts a valid quarterly subscription with an explicit startAt', () => {
    expect(() =>
      validateSubscriptionInput({
        cadence: 'quarterly',
        amountPerCycle: 5000n,
        startAt: Date.now(),
      })
    ).not.toThrow();
  });

  it('rejects an invalid cadence', () => {
    expect(() =>
      // @ts-expect-error intentionally invalid for the test
      validateSubscriptionInput({ cadence: 'weekly', amountPerCycle: 1000n })
    ).toThrow(SubscriptionValidationError);
  });

  it('rejects a zero amount', () => {
    expect(() => validateSubscriptionInput({ cadence: 'monthly', amountPerCycle: 0n })).toThrow(
      /greater than zero/
    );
  });

  it('rejects a negative amount', () => {
    expect(() => validateSubscriptionInput({ cadence: 'monthly', amountPerCycle: -1n })).toThrow(
      /greater than zero/
    );
  });

  it('rejects a non-bigint amount', () => {
    expect(() =>
      // @ts-expect-error intentionally invalid for the test
      validateSubscriptionInput({ cadence: 'monthly', amountPerCycle: 1000 })
    ).toThrow(/must be a bigint/);
  });

  it('rejects a negative startAt', () => {
    expect(() =>
      validateSubscriptionInput({ cadence: 'monthly', amountPerCycle: 1000n, startAt: -1 })
    ).toThrow(/cannot be negative/);
  });

  it('rejects a non-finite startAt', () => {
    expect(() =>
      validateSubscriptionInput({ cadence: 'monthly', amountPerCycle: 1000n, startAt: NaN })
    ).toThrow(/finite/);
  });

  it('includes the offending field name on the thrown error', () => {
    try {
      validateSubscriptionInput({ cadence: 'monthly', amountPerCycle: 0n });
      expect.fail('expected validateSubscriptionInput to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SubscriptionValidationError);
      expect((err as SubscriptionValidationError).field).toBe('amountPerCycle');
    }
  });
});

describe('cadenceLabel', () => {
  it('labels monthly and quarterly correctly', () => {
    expect(cadenceLabel('monthly')).toBe('Monthly');
    expect(cadenceLabel('quarterly')).toBe('Quarterly');
  });
});

describe('CADENCE_MONTHS', () => {
  it('defines the expected month counts', () => {
    expect(CADENCE_MONTHS.monthly).toBe(1);
    expect(CADENCE_MONTHS.quarterly).toBe(3);
  });
});
