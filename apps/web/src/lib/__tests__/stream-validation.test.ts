/**
 * Tests for stream validation utilities
 * **Issue #398: Prevent selecting past start times in date picker**
 * **Enforces: min start time of now + 60s**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateStartTime,
  validateEndTime,
  calculateEndTime,
  getMinStartTime,
  MIN_START_TIME_OFFSET_SECONDS,
  formatEndTime,
  getRelativeTime,
  durationToSeconds,
} from '../stream-validation';

// Helper to freeze time at a known Unix timestamp
const NOW = 1_000_000_000; // Arbitrary fixed timestamp

describe('MIN_START_TIME_OFFSET_SECONDS', () => {
  it('should be exactly 60 seconds', () => {
    expect(MIN_START_TIME_OFFSET_SECONDS).toBe(60);
  });
});

describe('getMinStartTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return now + 60 seconds', () => {
    expect(getMinStartTime()).toBe(NOW + 60);
  });
});

describe('validateStartTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- null (no explicit start time) is valid ---

  it('should accept null (no explicit start time selected)', () => {
    expect(validateStartTime(null)).toBeNull();
  });

  // --- Rejection cases ---

  it('should reject startTime exactly at now (too early)', () => {
    expect(validateStartTime(NOW)).toBe(
      'Start time must be at least 60 seconds from now',
    );
  });

  it('should reject startTime in the past', () => {
    expect(validateStartTime(NOW - 3600)).toBe(
      'Start time must be at least 60 seconds from now',
    );
  });

  it('should reject startTime slightly before the minimum offset (now+59)', () => {
    expect(validateStartTime(NOW + 59)).toBe(
      'Start time must be at least 60 seconds from now',
    );
  });

  // --- Acceptance cases ---

  it('should accept startTime exactly at the minimum offset (now+60)', () => {
    expect(validateStartTime(NOW + 60)).toBeNull();
  });

  it('should accept startTime well in the future', () => {
    expect(validateStartTime(NOW + 86400)).toBeNull();
  });

  it('should accept startTime far in the future', () => {
    expect(validateStartTime(NOW + 31536000)).toBeNull();
  });
});

describe('calculateEndTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should use getMinStartTime() when startTime is null', () => {
    const endTime = calculateEndTime(null, 1, 'hour');
    // effective start = getMinStartTime() = NOW + 60, plus 3600s = NOW + 3660
    expect(endTime).toBe(NOW + 60 + 3600);
  });

  it('should use explicit startTime when provided', () => {
    const endTime = calculateEndTime(NOW + 60, 2, 'hour');
    expect(endTime).toBe(NOW + 60 + 7200);
  });

  it('should handle week duration unit', () => {
    const endTime = calculateEndTime(NOW + 60, 1, 'week');
    expect(endTime).toBe(NOW + 60 + 604800);
  });

  it('should handle month duration unit', () => {
    const endTime = calculateEndTime(NOW + 60, 1, 'month');
    expect(endTime).toBe(NOW + 60 + 2592000);
  });

  it('should handle year duration unit', () => {
    const endTime = calculateEndTime(NOW + 60, 1, 'year');
    expect(endTime).toBe(NOW + 60 + 31536000);
  });
});

describe('validateEndTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Success paths ---

  it('should accept null startTime with a long-enough duration (1 hour)', () => {
    // effective start = NOW + 60, endTime = NOW + 60 + 3600 = NOW + 3660 >= NOW + 60 ✓
    expect(validateEndTime(null, '1', 'hour')).toBeNull();
  });

  it('should accept a duration close to the minimum allowed unit (1 day)', () => {
    expect(validateEndTime(null, '1', 'day')).toBeNull();
  });

  it('should accept an explicit valid startTime (now+60) with a regular duration', () => {
    expect(validateEndTime(NOW + 60, '1', 'hour')).toBeNull();
  });

  it('should accept an explicit future startTime (now+86400) with any duration', () => {
    expect(validateEndTime(NOW + 86400, '1', 'hour')).toBeNull();
  });

  // --- Failure paths: duration parsing ---

  it('should reject an empty duration string', () => {
    expect(validateEndTime(null, '', 'hour')).toBe(
      'Duration must be a valid number',
    );
  });

  it('should reject a non-numeric duration', () => {
    expect(validateEndTime(null, 'abc', 'hour')).toBe(
      'Duration must be a valid number',
    );
  });

  it('should reject duration of zero', () => {
    expect(validateEndTime(null, '0', 'hour')).toBe(
      'Duration must be greater than zero',
    );
  });

  it('should reject a negative duration', () => {
    expect(validateEndTime(null, '-5', 'hour')).toBe(
      'Duration must be greater than zero',
    );
  });

  it('should reject an invalid duration unit', () => {
    expect(validateEndTime(null, '1', 'lightyear')).toBe(
      'Invalid duration unit',
    );
  });

  // --- Failure paths: start time validation ---

  it('should reject an explicit past startTime (now-3600) even with a long duration', () => {
    expect(validateEndTime(NOW - 3600, '24', 'hour')).toBe(
      'Start time must be at least 60 seconds from now',
    );
  });

  it('should reject an explicit startTime exactly at now', () => {
    expect(validateEndTime(NOW, '1', 'hour')).toBe(
      'Start time must be at least 60 seconds from now',
    );
  });

  it('should reject an explicit startTime just under the minimum (now+59)', () => {
    expect(validateEndTime(NOW + 59, '1', 'hour')).toBe(
      'Start time must be at least 60 seconds from now',
    );
  });

  // --- Failure paths: end time too close ---

  it('should enforce the minimum end-time offset for all valid duration inputs', () => {
    // For any valid input (duration > 0, valid unit), endTime should always
    // exceed minEndTime because calculateEndTime's effective start is now+60
    // and the minimum positive duration (1 hour = 3600s) pushes endTime well past it.
    // This invariant is tested across multiple duration/unit combinations.
    const minValidCases = [
      { startTime: null, durationValue: '1', durationUnit: 'hour' },
      { startTime: NOW + 60, durationValue: '1', durationUnit: 'hour' },
      { startTime: null, durationValue: '1', durationUnit: 'day' },
      { startTime: null, durationValue: '1', durationUnit: 'week' },
      { startTime: null, durationValue: '1', durationUnit: 'month' },
      { startTime: null, durationValue: '1', durationUnit: 'year' },
    ];

    for (const { startTime, durationValue, durationUnit } of minValidCases) {
      expect(validateEndTime(startTime, durationValue, durationUnit)).toBeNull();
    }
  });

  // --- Edge cases ---

  it('should handle very large duration values', () => {
    expect(validateEndTime(null, '999999', 'year')).toBeNull();
  });

  it('should handle decimal duration values (parseInt floors to integer)', () => {
    // parseInt('1.5') = 1, so it's valid
    expect(validateEndTime(null, '1.5', 'hour')).toBeNull();
  });

  it('should handle duration with leading/trailing whitespace', () => {
    // parseInt handles whitespace
    expect(validateEndTime(null, '  1  ', 'hour')).toBeNull();
  });

  it('should be consistent across repeated calls with various inputs', () => {
    const testCases: Array<{
      startTime: number | null;
      durationValue: string;
      durationUnit: string;
      expected: string | null;
    }> = [
      // Valid cases
      { startTime: null, durationValue: '1', durationUnit: 'hour', expected: null },
      { startTime: NOW + 60, durationValue: '1', durationUnit: 'hour', expected: null },
      { startTime: NOW + 86400, durationValue: '7', durationUnit: 'day', expected: null },
      // Invalid duration
      { startTime: null, durationValue: '', durationUnit: 'hour', expected: 'Duration must be a valid number' },
      { startTime: null, durationValue: '0', durationUnit: 'day', expected: 'Duration must be greater than zero' },
      { startTime: null, durationValue: 'abc', durationUnit: 'hour', expected: 'Duration must be a valid number' },
      // Invalid unit
      { startTime: null, durationValue: '5', durationUnit: 'invalid', expected: 'Invalid duration unit' },
      // Invalid start time
      { startTime: NOW, durationValue: '1', durationUnit: 'hour', expected: 'Start time must be at least 60 seconds from now' },
      { startTime: NOW - 1, durationValue: '24', durationUnit: 'hour', expected: 'Start time must be at least 60 seconds from now' },
    ];

    for (const { startTime, durationValue, durationUnit, expected } of testCases) {
      expect(validateEndTime(startTime, durationValue, durationUnit)).toBe(expected);
    }
  });

  it('should not be affected by wall-clock drift during validation', () => {
    // Even with time progression during validation, the result should be consistent
    const result1 = validateEndTime(null, '1', 'hour');
    // Simulate time advancing 30 seconds
    vi.setSystemTime(new Date((NOW + 30) * 1000));
    const result2 = validateEndTime(null, '1', 'hour');
    expect(result1).toBe(result2);
  });
});

describe('durationToSeconds', () => {
  it('should convert hours correctly', () => {
    expect(durationToSeconds(2, 'hour')).toBe(7200);
  });

  it('should convert days correctly', () => {
    expect(durationToSeconds(1, 'day')).toBe(86400);
  });

  it('should convert weeks correctly', () => {
    expect(durationToSeconds(1, 'week')).toBe(604800);
  });

  it('should convert months correctly', () => {
    expect(durationToSeconds(1, 'month')).toBe(2592000);
  });

  it('should convert years correctly', () => {
    expect(durationToSeconds(1, 'year')).toBe(31536000);
  });

  it('should handle fractional values', () => {
    expect(durationToSeconds(0.5, 'hour')).toBe(1800);
    expect(durationToSeconds(2.5, 'day')).toBe(216000);
  });
});

describe('formatEndTime', () => {
  it('should format a timestamp correctly', () => {
    const timestamp = 1705315200; // Jan 15, 2024 12:00:00 UTC
    const formatted = formatEndTime(timestamp);
    expect(formatted).toContain('2024');
    expect(formatted).toContain('UTC');
  });
});

describe('getRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "in the past" for past timestamps', () => {
    expect(getRelativeTime(NOW - 5)).toBe('in the past');
  });

  it('should return minutes for near-future timestamps', () => {
    expect(getRelativeTime(NOW + 120)).toBe('in 2 minutes');
  });

  it('should return hours for timestamps hours away', () => {
    expect(getRelativeTime(NOW + 7200)).toBe('in 2 hours');
  });

  it('should return days for timestamps days away', () => {
    expect(getRelativeTime(NOW + 172800)).toBe('in 2 days');
  });

  it('should return "in less than a minute" for very near time', () => {
    expect(getRelativeTime(NOW + 30)).toBe('in less than a minute');
  });
});
