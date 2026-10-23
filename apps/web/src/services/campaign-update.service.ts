/**
 * Campaign Update Service
 *
 * Stores the rich-text update posts a creator publishes on a campaign and
 * exposes the operations the API routes need: create, edit, publish, archive
 * and delete.
 *
 * Backed by an in-memory data source with a `set*` seam, matching the pattern
 * used by every other campaign service in this codebase so a durable backend
 * can be dropped in without touching the routes.
 */

import { generateMarkdownExcerpt } from "@/lib/markdown";
import {
  MAX_CAMPAIGN_UPDATE_BODY_LENGTH,
  MAX_CAMPAIGN_UPDATE_IMAGES,
  MAX_CAMPAIGN_UPDATE_TITLE_LENGTH,
  isCampaignUpdateNotificationMode,
  type CampaignUpdateFilter,
  type CampaignUpdateNotificationMode,
  type CampaignUpdatePost,
  type CampaignUpdateQueryInput,
  type CampaignUpdateStatus,
  type CampaignUpdateVisibility,
} from "@/types/campaign-update";

export type { CampaignUpdatePost } from "@/types/campaign-update";

// ── Data source ────────────────────────────────────────────────────────────────

export interface CampaignUpdateDataSource {
  getUpdates(query: CampaignUpdateQueryInput): Promise<CampaignUpdatePost[]>;
  getUpdateById(id: string): Promise<CampaignUpdatePost | null>;
  saveUpdate(update: CampaignUpdatePost): Promise<CampaignUpdatePost>;
  deleteUpdate(id: string): Promise<boolean>;
  getUpdateCount(filter: CampaignUpdateFilter): Promise<number>;
}

const normalizeId = (id: string) => id.trim().toLowerCase();

export class InMemoryCampaignUpdateDataSource implements CampaignUpdateDataSource {
  private updates = new Map<string, CampaignUpdatePost>();

  async getUpdates(query: CampaignUpdateQueryInput): Promise<CampaignUpdatePost[]> {
    let updates = Array.from(this.updates.values());

    const filter = query.filter;
    if (filter) {
      if (filter.campaignId) {
        const campaignId = normalizeId(filter.campaignId);
        updates = updates.filter((u) => normalizeId(u.campaignId) === campaignId);
      }
      if (filter.creatorAddress) {
        const creator = normalizeId(filter.creatorAddress);
        updates = updates.filter((u) => normalizeId(u.creatorAddress) === creator);
      }
      if (filter.status) {
        updates = updates.filter((u) => u.status === filter.status);
      }
      if (filter.visibility) {
        updates = updates.filter((u) => u.visibility === filter.visibility);
      }
      if (filter.search) {
        const needle = filter.search.toLowerCase();
        updates = updates.filter(
          (u) =>
            u.title.toLowerCase().includes(needle) ||
            u.bodyMarkdown.toLowerCase().includes(needle) ||
            (u.excerpt?.toLowerCase().includes(needle) ?? false),
        );
      }
    }

    // Chronological order is the default: the feed reads oldest → newest.
    updates.sort((a, b) => {
      const left = a.publishedAt ?? a.createdAt;
      const right = b.publishedAt ?? b.createdAt;
      if (left !== right) return left - right;
      return a.createdAt - b.createdAt;
    });

    if (query.order === "reverse_chronological") {
      updates.reverse();
    }

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    return updates.slice(offset, offset + limit);
  }

  async getUpdateById(id: string): Promise<CampaignUpdatePost | null> {
    return this.updates.get(id) ?? null;
  }

  async saveUpdate(update: CampaignUpdatePost): Promise<CampaignUpdatePost> {
    this.updates.set(update.id, update);
    return update;
  }

  async deleteUpdate(id: string): Promise<boolean> {
    return this.updates.delete(id);
  }

  async getUpdateCount(filter: CampaignUpdateFilter): Promise<number> {
    const updates = await this.getUpdates({ filter, limit: Number.MAX_SAFE_INTEGER });
    return updates.length;
  }
}

let defaultDataSource: CampaignUpdateDataSource | undefined;

export function getCampaignUpdateDataSource(): CampaignUpdateDataSource {
  return (defaultDataSource ??= new InMemoryCampaignUpdateDataSource());
}

export function setCampaignUpdateDataSource(dataSource: CampaignUpdateDataSource): void {
  defaultDataSource = dataSource;
}

/** Drop every stored update. Used by tests to isolate state. */
export function resetCampaignUpdateDataSource(): void {
  defaultDataSource = new InMemoryCampaignUpdateDataSource();
}

// ── Validation ─────────────────────────────────────────────────────────────────

export class CampaignUpdateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignUpdateValidationError";
  }
}

export interface CampaignUpdateInput {
  campaignId: string;
  creatorAddress: string;
  title: string;
  bodyMarkdown: string;
  excerpt?: string;
  imageUrls?: string[];
  tags?: string[];
  status?: CampaignUpdateStatus;
  visibility?: CampaignUpdateVisibility;
  notifyBackers?: boolean;
  notificationMode?: CampaignUpdateNotificationMode;
}

/** Validate and normalise the payload used to create or edit an update. */
export function validateCampaignUpdate(input: CampaignUpdateInput): {
  isValid: boolean;
  error?: string;
} {
  if (!input.campaignId?.trim()) {
    return { isValid: false, error: "campaignId is required" };
  }
  if (!input.creatorAddress?.trim()) {
    return { isValid: false, error: "creatorAddress is required" };
  }
  if (!input.title?.trim()) {
    return { isValid: false, error: "Title is required" };
  }
  if (input.title.trim().length > MAX_CAMPAIGN_UPDATE_TITLE_LENGTH) {
    return {
      isValid: false,
      error: `Title must be ${MAX_CAMPAIGN_UPDATE_TITLE_LENGTH} characters or less`,
    };
  }
  if (!input.bodyMarkdown?.trim()) {
    return { isValid: false, error: "Body is required" };
  }
  if (input.bodyMarkdown.length > MAX_CAMPAIGN_UPDATE_BODY_LENGTH) {
    return {
      isValid: false,
      error: `Body must be ${MAX_CAMPAIGN_UPDATE_BODY_LENGTH} characters or less`,
    };
  }
  if ((input.imageUrls?.length ?? 0) > MAX_CAMPAIGN_UPDATE_IMAGES) {
    return {
      isValid: false,
      error: `An update can hold at most ${MAX_CAMPAIGN_UPDATE_IMAGES} images`,
    };
  }
  if (input.status && !["draft", "published", "archived"].includes(input.status)) {
    return { isValid: false, error: "Status must be 'draft', 'published' or 'archived'" };
  }
  if (input.visibility && !["public", "backers_only"].includes(input.visibility)) {
    return { isValid: false, error: "Visibility must be 'public' or 'backers_only'" };
  }
  if (
    input.notificationMode !== undefined &&
    !isCampaignUpdateNotificationMode(input.notificationMode)
  ) {
    return { isValid: false, error: "Unknown notification mode" };
  }
  return { isValid: true };
}

// ── Operations ────────────────────────────────────────────────────────────────

function newUpdateId(): string {
  return `upd_${crypto.randomUUID()}`;
}

/** Create a new update post. Posts start as drafts unless told otherwise. */
export async function createCampaignUpdate(
  input: CampaignUpdateInput,
  dataSource = getCampaignUpdateDataSource(),
  now = Date.now(),
): Promise<CampaignUpdatePost> {
  const validation = validateCampaignUpdate(input);
  if (!validation.isValid) {
    throw new CampaignUpdateValidationError(validation.error ?? "Invalid update");
  }

  const status: CampaignUpdateStatus = input.status ?? "draft";
  const bodyMarkdown = input.bodyMarkdown.trim();

  const update: CampaignUpdatePost = {
    id: newUpdateId(),
    campaignId: input.campaignId.trim(),
    creatorAddress: input.creatorAddress.trim(),
    title: input.title.trim(),
    bodyMarkdown,
    excerpt: input.excerpt?.trim() || generateMarkdownExcerpt(bodyMarkdown),
    imageUrls: [...(input.imageUrls ?? [])],
    tags: [...(input.tags ?? [])],
    status,
    visibility: input.visibility ?? "public",
    notifyBackers: input.notifyBackers ?? true,
    notificationMode: input.notificationMode ?? "instant",
    createdAt: now,
    updatedAt: now,
    ...(status === "published" ? { publishedAt: now } : {}),
  };

  return dataSource.saveUpdate(update);
}

/** Apply a partial edit to an existing update. */
export async function updateCampaignUpdate(
  updateId: string,
  patch: Partial<CampaignUpdateInput>,
  dataSource = getCampaignUpdateDataSource(),
  now = Date.now(),
): Promise<CampaignUpdatePost> {
  const existing = await dataSource.getUpdateById(updateId);
  if (!existing) {
    throw new CampaignUpdateValidationError("Update not found");
  }

  const merged: CampaignUpdateInput = {
    campaignId: patch.campaignId ?? existing.campaignId,
    creatorAddress: patch.creatorAddress ?? existing.creatorAddress,
    title: patch.title ?? existing.title,
    bodyMarkdown: patch.bodyMarkdown ?? existing.bodyMarkdown,
    excerpt: patch.excerpt,
    imageUrls: patch.imageUrls ?? existing.imageUrls,
    tags: patch.tags ?? existing.tags,
    status: patch.status ?? existing.status,
    visibility: patch.visibility ?? existing.visibility,
    notifyBackers: patch.notifyBackers ?? existing.notifyBackers,
    notificationMode: patch.notificationMode ?? existing.notificationMode,
  };

  const validation = validateCampaignUpdate(merged);
  if (!validation.isValid) {
    throw new CampaignUpdateValidationError(validation.error ?? "Invalid update");
  }

  const bodyMarkdown = merged.bodyMarkdown.trim();
  const next: CampaignUpdatePost = {
    ...existing,
    title: merged.title.trim(),
    bodyMarkdown,
    excerpt:
      patch.excerpt !== undefined
        ? patch.excerpt?.trim() || generateMarkdownExcerpt(bodyMarkdown)
        : existing.excerpt,
    imageUrls: [...(merged.imageUrls ?? [])],
    tags: [...(merged.tags ?? [])],
    status: merged.status ?? existing.status,
    visibility: merged.visibility ?? existing.visibility,
    notifyBackers: merged.notifyBackers ?? existing.notifyBackers,
    notificationMode: merged.notificationMode ?? existing.notificationMode,
    updatedAt: now,
  };

  // Publishing for the first time stamps the publication time.
  if (next.status === "published" && next.publishedAt === undefined) {
    next.publishedAt = now;
  }

  return dataSource.saveUpdate(next);
}

/** Move an update into the published state, stamping `publishedAt`. */
export async function publishCampaignUpdate(
  updateId: string,
  dataSource = getCampaignUpdateDataSource(),
  now = Date.now(),
): Promise<CampaignUpdatePost> {
  const existing = await dataSource.getUpdateById(updateId);
  if (!existing) {
    throw new CampaignUpdateValidationError("Update not found");
  }
  const published: CampaignUpdatePost = {
    ...existing,
    status: "published",
    publishedAt: existing.publishedAt ?? now,
    updatedAt: now,
  };
  return dataSource.saveUpdate(published);
}

/** Remove an update entirely. */
export async function deleteCampaignUpdate(
  updateId: string,
  dataSource = getCampaignUpdateDataSource(),
): Promise<boolean> {
  return dataSource.deleteUpdate(updateId);
}

/** Fetch a single update. */
export async function getCampaignUpdate(
  updateId: string,
  dataSource = getCampaignUpdateDataSource(),
): Promise<CampaignUpdatePost | null> {
  return dataSource.getUpdateById(updateId);
}

/**
 * List the updates of a campaign in feed order.
 *
 * `order` defaults to `"chronological"` so the campaign page reads
 * oldest → newest; pass `"reverse_chronological"` for a newest-first list.
 */
export async function listCampaignUpdates(
  filter: CampaignUpdateFilter,
  options: { limit?: number; offset?: number; order?: "chronological" | "reverse_chronological" } = {},
  dataSource = getCampaignUpdateDataSource(),
): Promise<CampaignUpdatePost[]> {
  return dataSource.getUpdates({ filter, ...options });
}

/** Count the updates matching a filter. */
export async function countCampaignUpdates(
  filter: CampaignUpdateFilter,
  dataSource = getCampaignUpdateDataSource(),
): Promise<number> {
  return dataSource.getUpdateCount(filter);
}
