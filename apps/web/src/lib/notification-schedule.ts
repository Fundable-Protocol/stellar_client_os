import { z } from "zod";

/**
 * Pure schedule helpers for campaign progress notifications (#950).
 * React-free and side-effect-free so services, routes, and tests reuse them.
 */

// ── Schema ────────────────────────────────────────────────────────────────────

export const NOTIFICATION_FREQUENCIES = ["daily", "weekly", "monthly", "milestones"] as const;
export type NotificationFrequency = (typeof NOTIFICATION_FREQUENCIES)[number];

export const NOTIFICATION_CHANNELS = ["email", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const notificationPreferencesSchema = z.object({
  frequency: z.enum(NOTIFICATION_FREQUENCIES),
  channel: z.enum(NOTIFICATION_CHANNELS),
  /** Required for the email channel. */
  email: z.string().email().optional(),
  /** Required for the push channel (endpoint or device token). */
  pushEndpoint: z.string().min(1).max(512).optional(),
  /** Only include campaigns this sponsor sponsors (informational). */
  campaignIds: z.array(z.string()).optional(),
});

// ── Intervals ─────────────────────────────────────────────────────────────────

/** Seconds between digests per frequency (milestones = none; event-driven). */
export const FREQUENCY_INTERVAL_SECONDS: Record<NotificationFrequency, number | null> = {
  daily: 86_400,
  weekly: 604_800,
  monthly: 2_592_000,
  milestones: null,
};

/**
 * When the next digest is due for a sponsor with the given frequency,
 * relative to `lastNotifiedAt` (epoch ms). `null` = never (milestones mode).
 */
export function nextDigestDueAt(
  frequency: NotificationFrequency,
  lastNotifiedAt: number,
): number | null {
  const interval = FREQUENCY_INTERVAL_SECONDS[frequency];
  if (interval === null) return null;
  return lastNotifiedAt + interval * 1000;
}

/** Whether a progress digest is due right now for this preference. */
export function isDigestDue(
  prefs: { frequency: NotificationFrequency },
  lastNotifiedAt: number,
  now: number = Date.now(),
): boolean {
  const due = nextDigestDueAt(prefs.frequency, lastNotifiedAt);
  return due !== null && now >= due;
}

// ── Milestones ────────────────────────────────────────────────────────────────

export interface ProgressEvent {
  type: "progress" | "milestone";
  /** For milestones: a stable identifier (e.g. "50_percent", "goal_reached"). */
  milestoneKey?: string;
  payload?: Record<string, unknown>;
}

/** Milestone keys that always notify, regardless of frequency. */
export const MILESTONE_KEYS = ["25_percent", "50_percent", "75_percent", "goal_reached"] as const;

export function isMilestoneEvent(
  event: ProgressEvent | undefined | null,
): event is Required<Pick<ProgressEvent, "type" | "milestoneKey">> & ProgressEvent {
  return (
    !!event &&
    event.type === "milestone" &&
    typeof event.milestoneKey === "string" &&
    event.milestoneKey.length > 0
  );
}

/**
 * Whether an event should notify a sponsor with the given preference:
 * milestones always do; progress digests only when due.
 */
export function shouldNotify(
  prefs: { frequency: NotificationFrequency },
  event: ProgressEvent,
  lastNotifiedAt: number,
  now: number = Date.now(),
): boolean {
  if (isMilestoneEvent(event)) return true;
  return isDigestDue(prefs, lastNotifiedAt, now);
}

// ── Validation helper ─────────────────────────────────────────────────────────

/**
 * Validates a preferences payload and returns either the parsed value or a
 * user-readable error string.
 */
export function parseNotificationPreferences(input: unknown):
  | { ok: true; value: z.infer<typeof notificationPreferencesSchema> }
  | { ok: false; error: string } {
  const result = notificationPreferencesSchema.safeParse(input);
  if (result.success) {
    const { channel, email, pushEndpoint } = result.data;
    if (channel === "email" && !email) {
      return { ok: false, error: "email address is required for the email channel" };
    }
    if (channel === "push" && !pushEndpoint) {
      return { ok: false, error: "pushEndpoint is required for the push channel" };
    }
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}
