/**
 * Public entry point for the mobile offline layer.
 *
 * Usage (app startup):
 *   configureOfflineStorage(AsyncStorage);   // once, before first render
 *
 * Usage (screen):
 *   const { repository, wishlist, queue } = getOfflineServices();
 */

import { CampaignCache, CampaignRepository } from "./campaignCache";
import { type KeyValueStorage, getOfflineStorage } from "./storage";
import type { CampaignDetail, CampaignSummary } from "./types";
import { OfflineWishlist } from "./wishlist";
import { WishlistSyncQueue } from "./sync";

export * from "./storage";
export * from "./types";
export * from "./campaignCache";
export * from "./wishlist";
export * from "./sync";

export interface OfflineServices {
  cache: CampaignCache<CampaignSummary[], CampaignDetail>;
  repository: CampaignRepository<CampaignSummary[], CampaignDetail>;
  wishlist: OfflineWishlist;
  queue: WishlistSyncQueue;
}

let services: OfflineServices | null = null;

/**
 * Lazily construct the shared offline services. Pass an explicit `storage` to
 * override the globally configured backend (primarily for tests).
 *
 * Call `configureOfflineStorage` before the first call when you want the
 * services bound to a persisted store.
 */
export function getOfflineServices(storage?: KeyValueStorage): OfflineServices {
  if (!services) {
    const resolved = storage ?? getOfflineStorage();
    const cache = new CampaignCache<CampaignSummary[], CampaignDetail>(
      resolved,
    );
    services = {
      cache,
      repository: new CampaignRepository(cache),
      wishlist: new OfflineWishlist(resolved),
      queue: new WishlistSyncQueue(resolved),
    };
  }
  return services;
}

/** Reset the memoized services (tests / account switches). */
export function resetOfflineServices(): void {
  services = null;
}
