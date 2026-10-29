import { z } from "zod";

/**
 * Pure schedule helpers for the backer digest email.
 *
 * A backer can opt into a daily or weekly digest that summarises updates
 * across every campaign they have backed. Daily digests go out at 8 AM in the
 * backer's local time; weekly digests go out on Monday at 8 AM local time.
 * React-free and side-effect-free so services, routes, and tests reuse them.
 */

// ── Schema ────────────────────────────────────────────────────────────────────

export const BACKER_DIGEST_FREQUENCIES = ["off", "daily", "weekly"] as const;
export type BackerDigestFrequency = (typeof BACKER_DIGEST_FREQUENCIES)[number];

/** Local hour (0-23) at which digests are delivered. */
export const BACKER_DIGEST_SEND_HOUR = 8;
/** Local weekday on which weekly digests are delivered (Monday). */
export const BACKER_DIGEST_SEND_WEEKDAY = "Mon";

export const DEFAULT_BACKER_DIGEST_TIMEZONE = "UTC";

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export const backerDigestPreferenceSchema = z.object({
  frequency: z.enum(BACKER_DIGEST_FREQUENCIES),
  /** Required when the digest is enabled. */
  email: z.string().email().optional(),
  /** IANA timezone name, e.g. "Africa/Lagos". Defaults to UTC. */
  timezone: z
    .string()
    .refine(isValidTimezone, { message: "timezone must be a valid IANA timezone" })
    .optional(),
});

export function parseBackerDigestPreference(input: unknown):
  | { ok: true; value: z.infer<typeof backerDigestPreferenceSchema> }
  | { ok: false; error: string } {
  const result = backerDigestPreferenceSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  if (result.data.frequency !== "off" && !result.data.email) {
    return { ok: false, error: "email address is required to receive a digest" };
  }
  return { ok: true, value: result.data };
}

// ── Local time ────────────────────────────────────────────────────────────────

export interface LocalTimeParts {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Local hour, 0-23. */
  hour: number;
  /** Short English weekday, e.g. "Mon". */
  weekday: string;
}

export function getLocalTimeParts(now: number, timezone: string): LocalTimeParts {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_BACKER_DIGEST_TIMEZONE;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(now));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number.parseInt(get("hour"), 10) % 24,
    weekday: get("weekday"),
  };
}

// ── Due check ─────────────────────────────────────────────────────────────────

/** Whether `now` falls in the delivery window (the 8 AM local hour). */
export function isInDigestWindow(
  frequency: BackerDigestFrequency,
  now: number,
  timezone: string,
): boolean {
  if (frequency === "off") return false;
  const local = getLocalTimeParts(now, timezone);
  if (local.hour !== BACKER_DIGEST_SEND_HOUR) return false;
  return frequency === "daily" || local.weekday === BACKER_DIGEST_SEND_WEEKDAY;
}

/**
 * Stable key for the delivery period `now` belongs to (the local date of the
 * send). Used to guarantee at most one digest per period even if the
 * dispatcher runs several times within the 8 AM hour.
 */
export function digestPeriodKey(now: number, timezone: string): string {
  return getLocalTimeParts(now, timezone).date;
}

/** Whether a digest should be sent right now for this preference. */
export function isBackerDigestDue(
  prefs: { frequency: BackerDigestFrequency; timezone: string },
  lastSentPeriod: string | undefined,
  now: number = Date.now(),
): boolean {
  if (!isInDigestWindow(prefs.frequency, now, prefs.timezone)) return false;
  return lastSentPeriod !== digestPeriodKey(now, prefs.timezone);
}

/** How far back a digest of this frequency looks for updates (ms). */
export function digestLookbackMs(frequency: Exclude<BackerDigestFrequency, "off">): number {
  return frequency === "daily" ? 86_400_000 : 604_800_000;
}
