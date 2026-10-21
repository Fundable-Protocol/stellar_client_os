/**
 * Campaign Social Media Post Scheduling Service (Issue #1266)
 *
 * Allows campaign creators to:
 * 1. Connect and manage Twitter/X, Facebook, and LinkedIn accounts in creator settings
 * 2. Preview promotional posts across connected platforms before scheduling
 * 3. Schedule, reschedule, and cancel campaign promotional posts via a calendar workflow
 */

export type SchedulablePlatform = "twitter" | "facebook" | "linkedin";

export interface PlatformMetadata {
  id: SchedulablePlatform;
  label: string;
  shortLabel: string;
  maxChars: number;
  handlePlaceholder: string;
  accentColor: string;
}

export const SCHEDULABLE_PLATFORMS: Record<SchedulablePlatform, PlatformMetadata> = {
  twitter: {
    id: "twitter",
    label: "Twitter / X",
    shortLabel: "X",
    maxChars: 280,
    handlePlaceholder: "@your_campaign",
    accentColor: "#1DA1F2",
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    shortLabel: "FB",
    maxChars: 2000,
    handlePlaceholder: "facebook.com/your-campaign",
    accentColor: "#1877F2",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    shortLabel: "in",
    maxChars: 3000,
    handlePlaceholder: "linkedin.com/company/your-campaign",
    accentColor: "#0A66C2",
  },
};

export const ALL_SCHEDULABLE_PLATFORMS: SchedulablePlatform[] = [
  "twitter",
  "facebook",
  "linkedin",
];

export interface ConnectedSocialAccount {
  platform: SchedulablePlatform;
  connected: boolean;
  handle: string;
  displayName: string;
  connectedAt?: string;
  autoHashtags: boolean;
}

export interface CreatorSocialSettings {
  creatorAddress: string;
  accounts: Record<SchedulablePlatform, ConnectedSocialAccount>;
  defaultHashtags: string[];
  timezone: string;
  updatedAt: string;
}

export type ScheduledPostStatus = "scheduled" | "published" | "cancelled";

export interface ScheduledSocialPost {
  id: string;
  campaignId: string;
  campaignTitle: string;
  creatorAddress: string;
  platforms: SchedulablePlatform[];
  content: string;
  hashtags: string[];
  campaignUrl: string;
  mediaUrl?: string;
  /** ISO 8601 timestamp string in UTC or local date-time */
  scheduledFor: string;
  /** YYYY-MM-DD date key in UTC/local date for calendar indexing */
  dateKey: string;
  status: ScheduledPostStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectSocialAccountInput {
  platform: SchedulablePlatform;
  handle: string;
  displayName?: string;
  autoHashtags?: boolean;
}

export interface ScheduleSocialPostInput {
  campaignId: string;
  campaignTitle: string;
  creatorAddress: string;
  platforms: SchedulablePlatform[];
  content: string;
  hashtags?: string[];
  campaignUrl?: string;
  mediaUrl?: string;
  scheduledFor: string;
}

export interface PlatformPostPreview {
  platform: SchedulablePlatform;
  platformLabel: string;
  handle: string;
  displayName: string;
  connected: boolean;
  formattedBody: string;
  hashtagsText: string;
  campaignTitle: string;
  campaignUrl: string;
  mediaUrl?: string;
  scheduledFor?: string;
  characterCount: number;
  maxChars: number;
  remainingChars: number;
  isOverLimit: boolean;
}

export interface CalendarDayCell {
  dateKey: string;
  dayOfMonth: number;
  monthIndex: number;
  year: number;
  isCurrentMonth: boolean;
}

export interface SocialSchedulerStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SETTINGS_STORAGE_KEY = "fundable:creator-social-settings";
const POSTS_STORAGE_KEY = "fundable:scheduled-social-posts";

const memoryFallback = new Map<string, string>();

const defaultStore: SocialSchedulerStore = {
  getItem: (key: string) => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const val = window.localStorage.getItem(key);
        if (val !== null) return val;
      } catch {
        // fallback to in-memory
      }
    }
    return memoryFallback.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    memoryFallback.set(key, value);
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // ignore storage quota errors
      }
    }
  },
};

function readStore<T>(store: SocialSchedulerStore, key: string, fallback: T): T {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore<T>(store: SocialSchedulerStore, key: string, value: T): void {
  store.setItem(key, JSON.stringify(value));
}

export function normalizeHashtags(hashtags: string[] | string | undefined): string[] {
  if (!hashtags) return [];
  const rawList = Array.isArray(hashtags) ? hashtags : hashtags.split(/[,\s]+/);
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of rawList) {
    const cleaned = item.trim().replace(/^#+/, "");
    if (!cleaned) continue;
    const tag = `#${cleaned}`;
    const lower = tag.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      normalized.push(tag);
    }
  }
  return normalized;
}

export function toDateKey(dateInput: string | Date): string {
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    return dateInput.slice(0, 10);
  }
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDefaultSettings(creatorAddress: string): CreatorSocialSettings {
  const normalizedCreator = creatorAddress.trim() || "GD6W...X892";
  return {
    creatorAddress: normalizedCreator,
    accounts: {
      twitter: {
        platform: "twitter",
        connected: false,
        handle: "",
        displayName: "",
        autoHashtags: true,
      },
      facebook: {
        platform: "facebook",
        connected: false,
        handle: "",
        displayName: "",
        autoHashtags: true,
      },
      linkedin: {
        platform: "linkedin",
        connected: false,
        handle: "",
        displayName: "",
        autoHashtags: true,
      },
    },
    defaultHashtags: ["#Fundable", "#Stellar", "#Reforestation", "#ClimateImpact"],
    timezone: "UTC",
    updatedAt: new Date(0).toISOString(),
  };
}

export function getCreatorSocialSettings(
  creatorAddress: string,
  store: SocialSchedulerStore = defaultStore,
): CreatorSocialSettings {
  const key = creatorAddress.trim() || "GD6W...X892";
  const all = readStore<Record<string, CreatorSocialSettings>>(store, SETTINGS_STORAGE_KEY, {});
  const existing = all[key];
  if (!existing) {
    return createDefaultSettings(key);
  }
  const defaults = createDefaultSettings(key);
  return {
    ...defaults,
    ...existing,
    accounts: {
      twitter: { ...defaults.accounts.twitter, ...existing.accounts?.twitter },
      facebook: { ...defaults.accounts.facebook, ...existing.accounts?.facebook },
      linkedin: { ...defaults.accounts.linkedin, ...existing.accounts?.linkedin },
    },
  };
}

export function connectSocialAccount(
  creatorAddress: string,
  input: ConnectSocialAccountInput,
  store: SocialSchedulerStore = defaultStore,
  now: Date = new Date(),
): CreatorSocialSettings {
  const key = creatorAddress.trim() || "GD6W...X892";
  if (!ALL_SCHEDULABLE_PLATFORMS.includes(input.platform)) {
    throw new Error(`Unsupported social platform: ${String(input.platform)}`);
  }
  const trimmedHandle = input.handle.trim();
  if (!trimmedHandle) {
    throw new Error(`Account handle or profile name is required for ${SCHEDULABLE_PLATFORMS[input.platform].label}`);
  }

  const formattedHandle =
    input.platform === "twitter" && !trimmedHandle.startsWith("@")
      ? `@${trimmedHandle}`
      : trimmedHandle;

  const current = getCreatorSocialSettings(key, store);
  const updated: CreatorSocialSettings = {
    ...current,
    accounts: {
      ...current.accounts,
      [input.platform]: {
        platform: input.platform,
        connected: true,
        handle: formattedHandle,
        displayName: input.displayName?.trim() || formattedHandle,
        connectedAt: now.toISOString(),
        autoHashtags: input.autoHashtags ?? true,
      },
    },
    updatedAt: now.toISOString(),
  };

  const all = readStore<Record<string, CreatorSocialSettings>>(store, SETTINGS_STORAGE_KEY, {});
  all[key] = updated;
  writeStore(store, SETTINGS_STORAGE_KEY, all);
  return updated;
}

export function disconnectSocialAccount(
  creatorAddress: string,
  platform: SchedulablePlatform,
  store: SocialSchedulerStore = defaultStore,
  now: Date = new Date(),
): CreatorSocialSettings {
  const key = creatorAddress.trim() || "GD6W...X892";
  if (!ALL_SCHEDULABLE_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported social platform: ${String(platform)}`);
  }

  const current = getCreatorSocialSettings(key, store);
  const updated: CreatorSocialSettings = {
    ...current,
    accounts: {
      ...current.accounts,
      [platform]: {
        platform,
        connected: false,
        handle: "",
        displayName: "",
        connectedAt: undefined,
        autoHashtags: true,
      },
    },
    updatedAt: now.toISOString(),
  };

  const all = readStore<Record<string, CreatorSocialSettings>>(store, SETTINGS_STORAGE_KEY, {});
  all[key] = updated;
  writeStore(store, SETTINGS_STORAGE_KEY, all);
  return updated;
}

export function updateCreatorSocialSettings(
  creatorAddress: string,
  patch: { defaultHashtags?: string[] | string; timezone?: string },
  store: SocialSchedulerStore = defaultStore,
  now: Date = new Date(),
): CreatorSocialSettings {
  const key = creatorAddress.trim() || "GD6W...X892";
  const current = getCreatorSocialSettings(key, store);
  const updated: CreatorSocialSettings = {
    ...current,
    defaultHashtags:
      patch.defaultHashtags !== undefined
        ? normalizeHashtags(patch.defaultHashtags)
        : current.defaultHashtags,
    timezone: patch.timezone?.trim() || current.timezone,
    updatedAt: now.toISOString(),
  };

  const all = readStore<Record<string, CreatorSocialSettings>>(store, SETTINGS_STORAGE_KEY, {});
  all[key] = updated;
  writeStore(store, SETTINGS_STORAGE_KEY, all);
  return updated;
}

export interface BuildPostPreviewInput {
  platform: SchedulablePlatform;
  content: string;
  hashtags?: string[];
  campaignTitle: string;
  campaignUrl?: string;
  mediaUrl?: string;
  scheduledFor?: string;
  account?: ConnectedSocialAccount;
}

export function buildPostPreview(input: BuildPostPreviewInput): PlatformPostPreview {
  const meta = SCHEDULABLE_PLATFORMS[input.platform];
  const tags = normalizeHashtags(input.hashtags);
  const hashtagsText = tags.join(" ");
  const trimmedContent = input.content.trim();
  const campaignUrl = input.campaignUrl?.trim() || "https://fundable.protocol/campaigns/camp-101";

  const parts = [trimmedContent, hashtagsText, campaignUrl].filter(Boolean);
  const formattedBody = parts.join("\n\n");
  const characterCount = formattedBody.length;
  const remainingChars = meta.maxChars - characterCount;

  return {
    platform: input.platform,
    platformLabel: meta.label,
    handle: input.account?.handle || meta.handlePlaceholder,
    displayName: input.account?.displayName || input.campaignTitle || "Campaign Creator",
    connected: Boolean(input.account?.connected),
    formattedBody,
    hashtagsText,
    campaignTitle: input.campaignTitle,
    campaignUrl,
    mediaUrl: input.mediaUrl?.trim() || undefined,
    scheduledFor: input.scheduledFor,
    characterCount,
    maxChars: meta.maxChars,
    remainingChars,
    isOverLimit: remainingChars < 0,
  };
}

export function buildMultiPlatformPreviews(input: {
  platforms: SchedulablePlatform[];
  content: string;
  hashtags?: string[];
  campaignTitle: string;
  campaignUrl?: string;
  mediaUrl?: string;
  scheduledFor?: string;
  settings?: CreatorSocialSettings;
}): PlatformPostPreview[] {
  const targetPlatforms =
    input.platforms.length > 0 ? input.platforms : ALL_SCHEDULABLE_PLATFORMS;

  return targetPlatforms.map((platform) =>
    buildPostPreview({
      platform,
      content: input.content,
      hashtags: input.hashtags,
      campaignTitle: input.campaignTitle,
      campaignUrl: input.campaignUrl,
      mediaUrl: input.mediaUrl,
      scheduledFor: input.scheduledFor,
      account: input.settings?.accounts[platform],
    }),
  );
}

export interface ScheduledPostValidationResult {
  valid: boolean;
  error?: string;
}

export function validateScheduledPostInput(
  input: ScheduleSocialPostInput,
  settings: CreatorSocialSettings,
  now: Date = new Date(),
): ScheduledPostValidationResult {
  if (!input.campaignId?.trim()) {
    return { valid: false, error: "Campaign ID is required." };
  }
  if (!input.content?.trim()) {
    return { valid: false, error: "Post content cannot be empty." };
  }
  if (!Array.isArray(input.platforms) || input.platforms.length === 0) {
    return { valid: false, error: "Select at least one social media platform." };
  }

  for (const platform of input.platforms) {
    if (!ALL_SCHEDULABLE_PLATFORMS.includes(platform)) {
      return { valid: false, error: `Unsupported platform: ${String(platform)}.` };
    }
    const account = settings.accounts[platform];
    if (!account?.connected) {
      return {
        valid: false,
        error: `Please connect your ${SCHEDULABLE_PLATFORMS[platform].label} account in Creator Settings before scheduling.`,
      };
    }

    const preview = buildPostPreview({
      platform,
      content: input.content,
      hashtags: input.hashtags,
      campaignTitle: input.campaignTitle,
      campaignUrl: input.campaignUrl,
      mediaUrl: input.mediaUrl,
      scheduledFor: input.scheduledFor,
      account,
    });

    if (preview.isOverLimit) {
      return {
        valid: false,
        error: `${SCHEDULABLE_PLATFORMS[platform].label} post exceeds the ${preview.maxChars}-character limit (${preview.characterCount}/${preview.maxChars}).`,
      };
    }
  }

  if (!input.scheduledFor?.trim()) {
    return { valid: false, error: "Scheduled date and time are required." };
  }

  const scheduledTime = new Date(input.scheduledFor).getTime();
  if (Number.isNaN(scheduledTime)) {
    return { valid: false, error: "Scheduled date and time format is invalid." };
  }
  if (scheduledTime <= now.getTime()) {
    return { valid: false, error: "Scheduled date and time must be in the future." };
  }

  return { valid: true };
}

export type SchedulePostResult =
  | { ok: true; post: ScheduledSocialPost }
  | { ok: false; error: string };

export function scheduleSocialPost(
  input: ScheduleSocialPostInput,
  store: SocialSchedulerStore = defaultStore,
  now: Date = new Date(),
): SchedulePostResult {
  const creatorAddress = input.creatorAddress?.trim() || "GD6W...X892";
  const settings = getCreatorSocialSettings(creatorAddress, store);
  const validation = validateScheduledPostInput(input, settings, now);

  if (!validation.valid) {
    return { ok: false, error: validation.error || "Invalid scheduled post." };
  }

  const tags = normalizeHashtags(
    input.hashtags !== undefined ? input.hashtags : settings.defaultHashtags,
  );
  const campaignUrl =
    input.campaignUrl?.trim() ||
    `https://fundable.protocol/campaigns/${encodeURIComponent(input.campaignId.trim())}`;
  const dateKey = toDateKey(input.scheduledFor);

  const existingPosts = readStore<ScheduledSocialPost[]>(store, POSTS_STORAGE_KEY, []);
  const post: ScheduledSocialPost = {
    id: `post_${now.getTime()}_${ existingPosts.length + 1}`,
    campaignId: input.campaignId.trim(),
    campaignTitle: input.campaignTitle.trim() || "Campaign Promotion",
    creatorAddress,
    platforms: [...new Set(input.platforms)],
    content: input.content.trim(),
    hashtags: tags,
    campaignUrl,
    mediaUrl: input.mediaUrl?.trim() || undefined,
    scheduledFor: input.scheduledFor,
    dateKey,
    status: "scheduled",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  writeStore(store, POSTS_STORAGE_KEY, [...existingPosts, post]);
  return { ok: true, post };
}

export function listScheduledPosts(
  filters: {
    campaignId?: string;
    creatorAddress?: string;
    status?: ScheduledPostStatus;
    monthKey?: string;
  } = {},
  store: SocialSchedulerStore = defaultStore,
): ScheduledSocialPost[] {
  const all = readStore<ScheduledSocialPost[]>(store, POSTS_STORAGE_KEY, []);
  return all
    .filter((post) => {
      if (filters.campaignId && post.campaignId !== filters.campaignId.trim()) {
        return false;
      }
      if (
        filters.creatorAddress &&
        post.creatorAddress.toLowerCase() !== filters.creatorAddress.trim().toLowerCase()
      ) {
        return false;
      }
      if (filters.status && post.status !== filters.status) {
        return false;
      }
      if (filters.monthKey && !post.dateKey.startsWith(filters.monthKey)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}

export function rescheduleSocialPost(
  postId: string,
  scheduledFor: string,
  store: SocialSchedulerStore = defaultStore,
  now: Date = new Date(),
): SchedulePostResult {
  const scheduledTime = new Date(scheduledFor).getTime();
  if (!scheduledFor?.trim() || Number.isNaN(scheduledTime)) {
    return { ok: false, error: "Scheduled date and time format is invalid." };
  }
  if (scheduledTime <= now.getTime()) {
    return { ok: false, error: "Scheduled date and time must be in the future." };
  }

  const all = readStore<ScheduledSocialPost[]>(store, POSTS_STORAGE_KEY, []);
  const index = all.findIndex((p) => p.id === postId);
  if (index === -1) {
    return { ok: false, error: "Scheduled post not found." };
  }

  const updated: ScheduledSocialPost = {
    ...all[index],
    scheduledFor,
    dateKey: toDateKey(scheduledFor),
    status: "scheduled",
    updatedAt: now.toISOString(),
  };
  all[index] = updated;
  writeStore(store, POSTS_STORAGE_KEY, all);
  return { ok: true, post: updated };
}

export function cancelScheduledPost(
  postId: string,
  store: SocialSchedulerStore = defaultStore,
  now: Date = new Date(),
): ScheduledSocialPost | null {
  const all = readStore<ScheduledSocialPost[]>(store, POSTS_STORAGE_KEY, []);
  const index = all.findIndex((p) => p.id === postId);
  if (index === -1) return null;

  const updated: ScheduledSocialPost = {
    ...all[index],
    status: "cancelled",
    updatedAt: now.toISOString(),
  };
  all[index] = updated;
  writeStore(store, POSTS_STORAGE_KEY, all);
  return updated;
}

/**
 * Generates a 42-day (6-week) calendar grid for a given year and 0-indexed month
 * (Sunday = 0 through Saturday = 6).
 */
export function getCalendarMonthGrid(year: number, monthIndex: number): CalendarDayCell[] {
  const firstDayOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const startOffset = firstDayOfMonth.getUTCDay();
  const gridStart = new Date(Date.UTC(year, monthIndex, 1 - startOffset));

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(
      Date.UTC(
        gridStart.getUTCFullYear(),
        gridStart.getUTCMonth(),
        gridStart.getUTCDate() + i,
      ),
    );
    const cellYear = cellDate.getUTCFullYear();
    const cellMonth = cellDate.getUTCMonth();
    const cellDay = cellDate.getUTCDate();
    const dateKey = `${cellYear}-${String(cellMonth + 1).padStart(2, "0")}-${String(cellDay).padStart(2, "0")}`;

    cells.push({
      dateKey,
      dayOfMonth: cellDay,
      monthIndex: cellMonth,
      year: cellYear,
      isCurrentMonth: cellYear === year && cellMonth === monthIndex,
    });
  }

  return cells;
}

export function groupScheduledPostsByDate(
  posts: ScheduledSocialPost[],
): Record<string, ScheduledSocialPost[]> {
  const grouped: Record<string, ScheduledSocialPost[]> = {};
  for (const post of posts) {
    if (post.status === "cancelled") continue;
    const key = post.dateKey || toDateKey(post.scheduledFor);
    if (!key) continue;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(post);
  }
  return grouped;
}

export function resetSocialSchedulerStore(
  store: SocialSchedulerStore = defaultStore,
): void {
  memoryFallback.clear();
  writeStore(store, SETTINGS_STORAGE_KEY, {});
  writeStore(store, POSTS_STORAGE_KEY, []);
}
