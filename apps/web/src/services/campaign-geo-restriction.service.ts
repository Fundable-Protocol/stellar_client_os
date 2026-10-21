/**
 * Campaign Geo-Restriction Service
 *
 * Allows campaign creators to restrict backer eligibility to specific
 * countries or regions by configuring an allow-list or block-list of
 * ISO 3166-1 alpha-2 country codes.
 *
 * Three main concerns are handled here:
 *
 *  1. **Configuration** — creators set `GeoRestriction` on their campaign
 *     (allow-list or block-list of country codes).
 *
 *  2. **Eligibility check** — visitors' country is evaluated against the
 *     restriction and the result is returned to the caller.
 *
 *  3. **Compliance audit log** — every eligibility check is appended to an
 *     immutable in-memory log so the platform can demonstrate GDPR / OFAC
 *     compliance to auditors.
 *
 * @example
 * import {
 *   campaignGeoRestrictionService,
 *   checkGeoRestriction,
 * } from "@/services/campaign-geo-restriction.service";
 *
 * const result = checkGeoRestriction(campaign.geoRestriction, "US");
 * if (!result.allowed) {
 *   // render GeoRestrictedBanner
 * }
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * ISO 3166-1 alpha-2 country code.
 * Stored in upper-case (e.g. "US", "DE", "NG").
 */
export type CountryCode = string;

/** Whether the country list is additive (allow) or subtractive (block). */
export type GeoRestrictionMode = "allow" | "block";

/**
 * Geo-restriction policy attached to a campaign.
 * Stored on `CampaignRecord.geoRestriction`.
 */
export interface GeoRestriction {
  /**
   * `"allow"` — only visitors from `countryCodes` may back the campaign.
   * `"block"` — visitors from `countryCodes` are denied access.
   */
  mode: GeoRestrictionMode;
  /**
   * Non-empty list of ISO 3166-1 alpha-2 codes (upper-case).
   * Examples: ["US", "CA", "GB"]
   */
  countryCodes: CountryCode[];
  /**
   * Optional human-readable reason shown to blocked visitors and stored in
   * the audit log (e.g. "Regulatory requirements – OFAC sanctions list").
   */
  reason?: string;
  /** Creator address who configured the restriction. */
  createdBy: string;
  /** Unix ms timestamp when the restriction was last updated. */
  updatedAt: number;
}

/**
 * Result of evaluating a visitor's country against a campaign restriction.
 */
export interface GeoRestrictionCheckResult {
  /** Whether the visitor is allowed to view/back the campaign. */
  allowed: boolean;
  /**
   * ISO 3166-1 alpha-2 code that was checked.
   * `"UNKNOWN"` when the country could not be determined.
   */
  countryCode: CountryCode;
  /**
   * Human-readable message suitable for display to the visitor.
   * Present only when `allowed` is `false`.
   */
  blockedMessage?: string;
  /**
   * The restriction policy that produced this result.
   * `null` when the campaign has no restriction (always allowed).
   */
  restriction: GeoRestriction | null;
}

/** The event type stored in the compliance audit log. */
export type GeoRestrictionEventType = "ACCESS_ALLOWED" | "ACCESS_DENIED" | "RESTRICTION_UPDATED" | "RESTRICTION_REMOVED";

/**
 * A single entry in the geo-restriction compliance audit log.
 */
export interface GeoRestrictionAuditEvent {
  id: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  campaignId: string;
  eventType: GeoRestrictionEventType;
  /** Visitor country (for access checks) or actor address (for config changes). */
  actor: string;
  /** The snapshot of the restriction at the time of the event. */
  restriction: GeoRestriction | null;
  /** Additional context (e.g. IP hash, user agent hash). */
  metadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimum number of country codes required in a restriction. */
export const MIN_COUNTRY_CODES = 1;
/** Maximum number of country codes allowed in a restriction. */
export const MAX_COUNTRY_CODES = 250;

/** Regex for a strict ISO 3166-1 alpha-2 code (exactly 2 upper-case letters). */
const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

/**
 * Normalise and validate a raw country code string.
 * Returns the upper-cased code on success, `null` on failure.
 */
export function normalizeCountryCode(raw: unknown): CountryCode | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const normalized = raw.trim().toUpperCase();
  return COUNTRY_CODE_REGEX.test(normalized) ? normalized : null;
}

/**
 * Validate a `GeoRestriction` object.
 * Returns an array of human-readable error strings (empty = valid).
 */
export function validateGeoRestriction(restriction: unknown): string[] {
  const errors: string[] = [];
  if (!restriction || typeof restriction !== "object") {
    return ["Restriction must be an object"];
  }
  const r = restriction as Record<string, unknown>;

  if (r.mode !== "allow" && r.mode !== "block") {
    errors.push('mode must be "allow" or "block"');
  }

  if (!Array.isArray(r.countryCodes) || r.countryCodes.length < MIN_COUNTRY_CODES) {
    errors.push(`countryCodes must be a non-empty array`);
  } else if (r.countryCodes.length > MAX_COUNTRY_CODES) {
    errors.push(`countryCodes must contain at most ${MAX_COUNTRY_CODES} entries`);
  } else {
    const invalid = r.countryCodes.filter((c) => normalizeCountryCode(c) === null);
    if (invalid.length > 0) {
      errors.push(`invalid country codes: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? "…" : ""}`);
    }
  }

  if (r.reason !== undefined && (typeof r.reason !== "string" || r.reason.length > 500)) {
    errors.push("reason must be a string of at most 500 characters");
  }

  if (!r.createdBy || typeof r.createdBy !== "string") {
    errors.push("createdBy must be a non-empty string");
  }

  return errors;
}

/**
 * Build a GeoRestriction from raw input, normalising all country codes to
 * upper-case and deduplicating the list.
 *
 * Throws when `validateGeoRestriction` reports errors.
 */
export function buildGeoRestriction(input: {
  mode: GeoRestrictionMode;
  countryCodes: string[];
  reason?: string;
  createdBy: string;
}): GeoRestriction {
  const errors = validateGeoRestriction({ ...input, updatedAt: Date.now() });
  if (errors.length > 0) {
    throw new Error(`Invalid geo-restriction: ${errors.join("; ")}`);
  }
  const seen = new Set<string>();
  const normalizedCodes: CountryCode[] = [];
  for (const code of input.countryCodes) {
    const normalized = normalizeCountryCode(code);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      normalizedCodes.push(normalized);
    }
  }
  return {
    mode: input.mode,
    countryCodes: normalizedCodes,
    reason: input.reason?.trim() || undefined,
    createdBy: input.createdBy.trim(),
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Core eligibility check (pure, no side effects)
// ---------------------------------------------------------------------------

const DEFAULT_BLOCKED_MESSAGE =
  "This campaign is not available in your region due to local regulatory requirements.";

/**
 * Evaluate whether a visitor from `visitorCountry` is allowed access to a
 * campaign with the given `restriction`.
 *
 * This is a **pure function** — it has no side effects and does not write to
 * the audit log. Call `CampaignGeoRestrictionService.logEvent()` separately
 * when you need compliance logging.
 *
 * @param restriction  The campaign's current restriction (or `null`/`undefined`
 *                     when there is no restriction).
 * @param visitorCountry  ISO 3166-1 alpha-2 code for the visitor's country.
 *                        Pass `"UNKNOWN"` when geolocation is unavailable.
 */
export function checkGeoRestriction(
  restriction: GeoRestriction | null | undefined,
  visitorCountry: string,
): GeoRestrictionCheckResult {
  const countryCode = normalizeCountryCode(visitorCountry) ?? "UNKNOWN";

  // No restriction → always allowed.
  if (!restriction) {
    return { allowed: true, countryCode, restriction: null };
  }

  const inList = restriction.countryCodes.includes(countryCode);
  const allowed = restriction.mode === "allow" ? inList : !inList;

  if (allowed) {
    return { allowed: true, countryCode, restriction };
  }

  const blockedMessage = restriction.reason
    ? `${DEFAULT_BLOCKED_MESSAGE} Reason: ${restriction.reason}`
    : DEFAULT_BLOCKED_MESSAGE;

  return { allowed: false, countryCode, blockedMessage, restriction };
}

// ---------------------------------------------------------------------------
// Stateful service class (configuration + audit log)
// ---------------------------------------------------------------------------

/**
 * Stateful service for managing geo-restrictions and their audit trail.
 *
 * The in-memory stores are sufficient for the current single-process
 * deployment. A production system should persist both the restriction
 * (campaign record) and the audit log (append-only database table).
 */
export class CampaignGeoRestrictionService {
  /**
   * Audit log, keyed by campaignId then appended chronologically.
   * This is intentionally append-only — entries are never mutated or deleted.
   */
  private readonly auditLog = new Map<string, GeoRestrictionAuditEvent[]>();

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Apply (or replace) the geo-restriction for a campaign and append a
   * `RESTRICTION_UPDATED` event to the compliance audit log.
   *
   * @param campaignId  The campaign to restrict.
   * @param restriction  Validated restriction object (use `buildGeoRestriction`
   *                     to create one from raw input).
   * @returns           The stored restriction (identical to the input).
   */
  updateRestriction(campaignId: string, restriction: GeoRestriction): GeoRestriction {
    this.appendAuditEvent({
      campaignId,
      eventType: "RESTRICTION_UPDATED",
      actor: restriction.createdBy,
      restriction,
    });
    return restriction;
  }

  /**
   * Remove the geo-restriction from a campaign and append a
   * `RESTRICTION_REMOVED` event to the audit log.
   *
   * @param campaignId  The campaign whose restriction should be cleared.
   * @param removedBy   Address of the user removing the restriction.
   */
  removeRestriction(campaignId: string, removedBy: string): void {
    this.appendAuditEvent({
      campaignId,
      eventType: "RESTRICTION_REMOVED",
      actor: removedBy,
      restriction: null,
    });
  }

  // -------------------------------------------------------------------------
  // Eligibility check + audit
  // -------------------------------------------------------------------------

  /**
   * Check whether `visitorCountry` satisfies the campaign's geo-restriction
   * and write an `ACCESS_ALLOWED` or `ACCESS_DENIED` event to the audit log.
   *
   * @param campaignId      Campaign being accessed.
   * @param restriction     Current restriction on the campaign.
   * @param visitorCountry  ISO 3166-1 alpha-2 country code of the visitor.
   * @param metadata        Optional extra context (IP hash, user-agent hash,
   *                        request-id) stored only in the audit log.
   */
  checkAndLog(
    campaignId: string,
    restriction: GeoRestriction | null | undefined,
    visitorCountry: string,
    metadata?: Record<string, string>,
  ): GeoRestrictionCheckResult {
    const result = checkGeoRestriction(restriction, visitorCountry);
    this.appendAuditEvent({
      campaignId,
      eventType: result.allowed ? "ACCESS_ALLOWED" : "ACCESS_DENIED",
      actor: result.countryCode,
      restriction: result.restriction,
      metadata,
    });
    return result;
  }

  // -------------------------------------------------------------------------
  // Audit log retrieval
  // -------------------------------------------------------------------------

  /**
   * Return all audit events for a campaign in chronological order.
   */
  getAuditLog(campaignId: string): GeoRestrictionAuditEvent[] {
    return [...(this.auditLog.get(campaignId) ?? [])];
  }

  /**
   * Return only the `ACCESS_DENIED` events, which are the ones regulators
   * most frequently require for OFAC / GDPR compliance reports.
   */
  getDeniedAccessLog(campaignId: string): GeoRestrictionAuditEvent[] {
    return this.getAuditLog(campaignId).filter(
      (e) => e.eventType === "ACCESS_DENIED",
    );
  }

  /**
   * Return counts of denied accesses per country code, sorted by count desc.
   * Useful for creator dashboards to understand their restriction's impact.
   */
  getDeniedCountryCounts(
    campaignId: string,
  ): Array<{ countryCode: CountryCode; count: number }> {
    const counts = new Map<CountryCode, number>();
    for (const event of this.getDeniedAccessLog(campaignId)) {
      counts.set(event.actor, (counts.get(event.actor) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([countryCode, count]) => ({ countryCode, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Clear all audit log entries for a campaign.
   * Intended only for use in tests — in production the log must be immutable.
   */
  clearAuditLog(campaignId: string): void {
    this.auditLog.delete(campaignId);
  }

  /** Reset the entire service state. Use only in tests. */
  clearAll(): void {
    this.auditLog.clear();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private appendAuditEvent(
    input: Omit<GeoRestrictionAuditEvent, "id" | "timestamp">,
  ): GeoRestrictionAuditEvent {
    const event: GeoRestrictionAuditEvent = {
      id: `geo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...input,
    };
    const existing = this.auditLog.get(input.campaignId) ?? [];
    existing.push(event);
    this.auditLog.set(input.campaignId, existing);
    return event;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const campaignGeoRestrictionService = new CampaignGeoRestrictionService();
