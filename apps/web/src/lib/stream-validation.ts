/**
 * Stream validation utilities for payment stream forms
 */

import { StrKey } from "@stellar/stellar-sdk";

/**
 * Validate that a string is a valid Stellar contract ID (StrKey C... format)
 * @param contractId - The contract address to validate
 * @returns true if the address is a valid contract StrKey, false otherwise
 */
export function validateContractId(contractId: string): boolean {
  if (!contractId || typeof contractId !== "string") return false;
  try {
    return StrKey.isValidContract(contractId);
  } catch {
    return false;
  }
}

/**
 * Duration unit multipliers in seconds
 */
const DURATION_MULTIPLIERS = {
  hour: 60 * 60,
  day: 24 * 60 * 60,
  week: 7 * 24 * 60 * 60,
  month: 30 * 24 * 60 * 60,
  year: 365 * 24 * 60 * 60,
} as const;

export type DurationUnit = keyof typeof DURATION_MULTIPLIERS;

/**
 * Minimum offset in seconds from current time that a start time must be.
 * This ensures the stream never starts in the past after on-chain latency.
 */
export const MIN_START_TIME_OFFSET_SECONDS = 60;

/**
 * Get the earliest allowed start time (now + offset).
 * @returns Unix timestamp in seconds
 */
export function getMinStartTime(): number {
  return Math.floor(Date.now() / 1000) + MIN_START_TIME_OFFSET_SECONDS;
}

/**
 * Validate that an explicitly-provided start time is at least
 * `MIN_START_TIME_OFFSET_SECONDS` from now. When `startTime` is null
 * (i.e. no explicit start time was selected), validation is skipped
 * because the form defaults to the earliest allowed time.
 * @param startTime - Start timestamp in seconds, or null if not explicitly set
 * @returns Error message if invalid, null if valid or no explicit start time
 */
export function validateStartTime(startTime: number | null): string | null {
  // Null means no explicit start time picked; nothing to validate
  if (startTime === null) {
    return null;
  }

  const minStart = getMinStartTime();
  if (startTime < minStart) {
    return "Start time must be at least 60 seconds from now";
  }

  return null;
}

/**
 * Convert duration value and unit to seconds
 */
export function durationToSeconds(value: number, unit: DurationUnit): number {
  return value * DURATION_MULTIPLIERS[unit];
}

/**
 * Calculate stream end timestamp.
 * When startTime is null the effective start is `getMinStartTime()`,
 * ensuring the stream never appears to start in the past.
 * @param startTime - Start timestamp in seconds, or null to use min allowed start
 * @param durationValue - Duration value
 * @param durationUnit - Duration unit
 * @returns End timestamp in seconds
 */
export function calculateEndTime(
  startTime: number | null,
  durationValue: number,
  durationUnit: DurationUnit
): number {
  const start = startTime ?? getMinStartTime();
  const durationSeconds = durationToSeconds(durationValue, durationUnit);
  return start + durationSeconds;
}

/**
 * Validate that the stream end time is at least 60 seconds from now.
 * @param startTime - Start timestamp in seconds, or null to use min allowed start
 * @param durationValue - Duration value string
 * @param durationUnit - Duration unit string
 * @returns Error message if invalid, null if valid
 */
export function validateEndTime(
  startTime: number | null,
  durationValue: string,
  durationUnit: string
): string | null {
  // Parse duration value
  const duration = parseInt(durationValue);

  if (isNaN(duration)) {
    return "Duration must be a valid number";
  }

  if (duration <= 0) {
    return "Duration must be greater than zero";
  }

  // Validate duration unit
  if (!isDurationUnit(durationUnit)) {
    return "Invalid duration unit";
  }

  // Validate start time if it was explicitly provided
  const startTimeError = validateStartTime(startTime);
  if (startTimeError) {
    return startTimeError;
  }

  // Calculate end time and check it meets the minimum offset
  const endTime = calculateEndTime(startTime, duration, durationUnit);
  const minEndTime = getMinStartTime();

  if (endTime <= minEndTime) {
    return "Stream end time must be at least 60 seconds from now";
  }

  return null;
}

/**
 * Type guard for duration units
 */
function isDurationUnit(unit: string): unit is DurationUnit {
  return unit in DURATION_MULTIPLIERS;
}

/**
 * Format timestamp to human-readable date string (UTC)
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted date string
 */
export function formatEndTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);

  return date.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Get relative time description
 * @param timestamp - Unix timestamp in seconds
 * @returns Human-readable relative time
 */
export function getRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;

  if (diff < 0) {
    return "in the past";
  }

  const minutes = Math.floor(diff / 60);
  const hours = Math.floor(diff / 3600);
  const days = Math.floor(diff / 86400);
  const weeks = Math.floor(diff / 604800);
  const months = Math.floor(diff / 2592000);
  const years = Math.floor(diff / 31536000);

  if (years > 0) return `in ${years} year${years !== 1 ? 's' : ''}`;
  if (months > 0) return `in ${months} month${months !== 1 ? 's' : ''}`;
  if (weeks > 0) return `in ${weeks} week${weeks !== 1 ? 's' : ''}`;
  if (days > 0) return `in ${days} day${days !== 1 ? 's' : ''}`;
  if (hours > 0) return `in ${hours} hour${hours !== 1 ? 's' : ''}`;
  if (minutes > 0) return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;

  return "in less than a minute";
}
