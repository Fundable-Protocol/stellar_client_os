/**
 * Offline-first wishlist.
 *
 * The wishlist is stored locally and mutated without any network access, so a
 * sponsor can add/remove campaigns while offline. Every mutation is recorded
 * in a durable sync queue (see `sync.ts`) and flushed on reconnect.
 */

import { type KeyValueStorage, readJSON, writeJSON } from "./storage";

interface PersistedWishlist {
  ids: string[];
  updatedAt: number;
}

export interface WishlistChange {
  campaignId: string;
  /** `true` when the campaign was newly added, `false` otherwise. */
  added: boolean;
}

export interface OfflineWishlistOptions {
  namespace?: string;
  clock?: () => number;
}

export class OfflineWishlist {
  private readonly namespace: string;
  private readonly clock: () => number;

  constructor(
    private readonly storage: KeyValueStorage,
    options: OfflineWishlistOptions = {},
  ) {
    this.namespace = options.namespace ?? "fundable.offline.wishlist";
    this.clock = options.clock ?? Date.now;
  }

  key(): string {
    return `${this.namespace}.ids`;
  }

  /** Campaign ids currently wishlisted, in insertion order. */
  async list(): Promise<string[]> {
    const state = await readJSON<PersistedWishlist>(this.storage, this.key());
    return state?.ids ?? [];
  }

  async has(campaignId: string): Promise<boolean> {
    return (await this.list()).includes(campaignId);
  }

  /** Add a campaign; idempotent and safe to call repeatedly. */
  async add(campaignId: string): Promise<WishlistChange> {
    const ids = await this.list();
    if (ids.includes(campaignId)) {
      return { campaignId, added: false };
    }
    await this.persist([...ids, campaignId]);
    return { campaignId, added: true };
  }

  /** Remove a campaign; idempotent. */
  async remove(campaignId: string): Promise<WishlistChange> {
    const ids = await this.list();
    if (!ids.includes(campaignId)) {
      return { campaignId, added: false };
    }
    await this.persist(ids.filter((id) => id !== campaignId));
    return { campaignId, added: false };
  }

  /** Replace the whole list (used when reconciling with the server). */
  async replace(ids: readonly string[]): Promise<void> {
    const unique = [...new Set(ids)];
    await this.persist(unique);
  }

  private async persist(ids: string[]): Promise<void> {
    await writeJSON<PersistedWishlist>(this.storage, this.key(), {
      ids,
      updatedAt: this.clock(),
    });
  }
}
