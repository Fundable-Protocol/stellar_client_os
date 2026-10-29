import {
  digestLookbackMs,
  digestPeriodKey,
  isBackerDigestDue,
  parseBackerDigestPreference,
  DEFAULT_BACKER_DIGEST_TIMEZONE,
  type BackerDigestFrequency,
} from "@/lib/backer-digest-schedule";

/**
 * Backer digest service.
 *
 * Stores each backer's digest preference (off / daily / weekly), and builds and
 * sends one email per backer summarising updates across every campaign they
 * have backed. In-memory data sources, same pattern as the other campaign
 * services; swap via the `set*` functions when a durable backend lands.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BackerDigestPreference {
  /** Backer wallet address or account id. */
  backerId: string;
  frequency: BackerDigestFrequency;
  email?: string;
  /** IANA timezone used to resolve "8 AM local time". */
  timezone: string;
  /** Local-date key of the last delivered digest period. */
  lastSentPeriod?: string;
  /** Epoch ms of the last delivered digest (0 = never). */
  lastSentAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface BackerDigestPreferencesDataSource {
  getAll(): Promise<BackerDigestPreference[]>;
  get(backerId: string): Promise<BackerDigestPreference | null>;
  save(pref: BackerDigestPreference): Promise<BackerDigestPreference>;
}

export interface CampaignUpdate {
  campaignId: string;
  campaignName: string;
  title: string;
  summary?: string;
  /** Epoch ms. */
  postedAt: number;
}

/** Source of "campaigns this backer backed" and their updates. */
export interface BackerUpdatesSource {
  getBackedCampaignIds(backerId: string): Promise<string[]>;
  getUpdates(campaignIds: string[], since: number, until: number): Promise<CampaignUpdate[]>;
}

export interface DigestEmailSender {
  sendEmail(options: { to: string; subject: string; html: string }): Promise<boolean>;
}

// ── Data sources ──────────────────────────────────────────────────────────────

const normalizeId = (id: string) => id.trim().toLowerCase();

export class InMemoryBackerDigestPreferencesDataSource implements BackerDigestPreferencesDataSource {
  private records = new Map<string, BackerDigestPreference>();

  async getAll(): Promise<BackerDigestPreference[]> {
    return Array.from(this.records.values());
  }

  async get(backerId: string): Promise<BackerDigestPreference | null> {
    return this.records.get(normalizeId(backerId)) ?? null;
  }

  async save(pref: BackerDigestPreference): Promise<BackerDigestPreference> {
    this.records.set(normalizeId(pref.backerId), pref);
    return pref;
  }
}

export class InMemoryBackerUpdatesSource implements BackerUpdatesSource {
  private backed = new Map<string, Set<string>>();
  private updates: CampaignUpdate[] = [];

  recordBacking(backerId: string, campaignId: string): void {
    const key = normalizeId(backerId);
    const set = this.backed.get(key) ?? new Set<string>();
    set.add(campaignId);
    this.backed.set(key, set);
  }

  recordUpdate(update: CampaignUpdate): void {
    this.updates.push(update);
  }

  async getBackedCampaignIds(backerId: string): Promise<string[]> {
    return Array.from(this.backed.get(normalizeId(backerId)) ?? []);
  }

  async getUpdates(campaignIds: string[], since: number, until: number): Promise<CampaignUpdate[]> {
    const ids = new Set(campaignIds);
    return this.updates.filter(
      (u) => ids.has(u.campaignId) && u.postedAt > since && u.postedAt <= until,
    );
  }
}

let defaultPreferences: BackerDigestPreferencesDataSource | undefined;
let defaultUpdatesSource: BackerUpdatesSource | undefined;

export function getBackerDigestPreferencesDataSource(): BackerDigestPreferencesDataSource {
  return (defaultPreferences ??= new InMemoryBackerDigestPreferencesDataSource());
}

export function setBackerDigestPreferencesDataSource(
  dataSource: BackerDigestPreferencesDataSource,
): void {
  defaultPreferences = dataSource;
}

export function getBackerUpdatesSource(): BackerUpdatesSource {
  return (defaultUpdatesSource ??= new InMemoryBackerUpdatesSource());
}

export function setBackerUpdatesSource(source: BackerUpdatesSource): void {
  defaultUpdatesSource = source;
}

// ── Preferences ───────────────────────────────────────────────────────────────

export class BackerDigestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackerDigestValidationError";
  }
}

/** Create or update a backer's digest preference (opt in, change, or opt out). */
export async function setBackerDigestPreference(
  input: { backerId: string; frequency: BackerDigestFrequency; email?: string; timezone?: string },
  dataSource = getBackerDigestPreferencesDataSource(),
  now = Date.now(),
): Promise<BackerDigestPreference> {
  if (!input.backerId || !input.backerId.trim()) {
    throw new BackerDigestValidationError("backerId is required");
  }
  const existing = await dataSource.get(input.backerId);
  const email = input.email ?? existing?.email;
  const parsed = parseBackerDigestPreference({ ...input, email });
  if (!parsed.ok) throw new BackerDigestValidationError(parsed.error);

  const record: BackerDigestPreference = {
    backerId: input.backerId.trim(),
    frequency: input.frequency,
    email,
    timezone: input.timezone ?? existing?.timezone ?? DEFAULT_BACKER_DIGEST_TIMEZONE,
    lastSentPeriod: existing?.lastSentPeriod,
    lastSentAt: existing?.lastSentAt ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return dataSource.save(record);
}

export async function getBackerDigestPreference(
  backerId: string,
  dataSource = getBackerDigestPreferencesDataSource(),
): Promise<BackerDigestPreference | null> {
  return dataSource.get(backerId);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderBackerDigestEmail(
  frequency: Exclude<BackerDigestFrequency, "off">,
  updates: CampaignUpdate[],
): { subject: string; html: string } {
  const label = frequency === "daily" ? "Daily" : "Weekly";
  const byCampaign = new Map<string, { name: string; items: CampaignUpdate[] }>();
  for (const update of [...updates].sort((a, b) => a.postedAt - b.postedAt)) {
    const group = byCampaign.get(update.campaignId) ?? { name: update.campaignName, items: [] };
    group.items.push(update);
    byCampaign.set(update.campaignId, group);
  }

  const sections = Array.from(byCampaign.entries())
    .map(([campaignId, group]) => {
      const items = group.items
        .map(
          (u) =>
            `<li><strong>${escapeHtml(u.title)}</strong>${
              u.summary ? ` &mdash; ${escapeHtml(u.summary)}` : ""
            }</li>`,
        )
        .join("");
      return `<h3><a href="https://fundable.stellar/campaigns/${encodeURIComponent(campaignId)}">${escapeHtml(
        group.name,
      )}</a></h3><ul>${items}</ul>`;
    })
    .join("");

  return {
    subject: `Your ${label} Digest: ${updates.length} update${updates.length === 1 ? "" : "s"} across ${
      byCampaign.size
    } campaign${byCampaign.size === 1 ? "" : "s"}`,
    html: `<div style="font-family:sans-serif"><h2>${label} digest of your backed campaigns</h2>${sections}</div>`,
  };
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export interface BackerDigestDelivery {
  backerId: string;
  ok: boolean;
  /** True when a digest was due but there were no updates to report. */
  skipped?: boolean;
  error?: string;
}

/**
 * Send every digest that is due at `now`: backers whose local time is 8 AM
 * (daily) or Monday 8 AM (weekly) and who have not yet received this period's
 * digest. Failures never abort the loop; a failed send is retried on the next
 * run within the same 8 AM hour. Safe to call hourly.
 */
export async function dispatchBackerDigests(
  emailSender: DigestEmailSender,
  now: number = Date.now(),
  preferences = getBackerDigestPreferencesDataSource(),
  updatesSource = getBackerUpdatesSource(),
): Promise<BackerDigestDelivery[]> {
  const deliveries: BackerDigestDelivery[] = [];
  const all = await preferences.getAll();

  for (const pref of all) {
    if (pref.frequency === "off" || !pref.email) continue;
    if (!isBackerDigestDue(pref, pref.lastSentPeriod, now)) continue;

    try {
      const frequency = pref.frequency;
      const campaignIds = await updatesSource.getBackedCampaignIds(pref.backerId);
      const updates = campaignIds.length
        ? await updatesSource.getUpdates(campaignIds, now - digestLookbackMs(frequency), now)
        : [];

      if (updates.length > 0) {
        const content = renderBackerDigestEmail(frequency, updates);
        await emailSender.sendEmail({ to: pref.email, subject: content.subject, html: content.html });
      }

      // Mark the period handled (even when empty) so we don't re-check all hour.
      await preferences.save({
        ...pref,
        lastSentPeriod: digestPeriodKey(now, pref.timezone),
        lastSentAt: updates.length > 0 ? now : pref.lastSentAt,
        updatedAt: now,
      });
      deliveries.push({ backerId: pref.backerId, ok: true, skipped: updates.length === 0 });
    } catch (err) {
      deliveries.push({
        backerId: pref.backerId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return deliveries;
}
