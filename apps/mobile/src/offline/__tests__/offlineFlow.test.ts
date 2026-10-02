import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignRepository } from "../campaignCache";
import {
  getOfflineServices,
  resetOfflineServices,
} from "../index";
import { createMemoryStorage } from "../storage";
import {
  WishlistSyncEngine,
  bindSyncOnReconnect,
  createConnectivityMonitor,
  createManualConnectivitySource,
  type WishlistRemote,
} from "../sync";
import type { CampaignSummary } from "../types";

const summary = (id: string): CampaignSummary => ({
  id,
  name: `Campaign ${id}`,
  status: "active",
  goalAmount: "1000",
  raisedAmount: "10",
  treeCount: 5,
  sponsorCount: 1,
});

afterEach(() => {
  resetOfflineServices();
});

describe("offline campaign flow", () => {
  it("browses a cached campaign, edits the wishlist offline, then syncs once on reconnect", async () => {
    const storage = createMemoryStorage();
    const services = getOfflineServices(storage);
    const repository = services.repository;

    // 1. Online: browsing populates the persisted cache.
    await repository.loadList(async () => [summary("c1"), summary("c2")]);

    // 2. Offline: network is down, the cached list is served.
    const offlineBrowse = await repository.loadList(async () => {
      throw new Error("offline");
    });
    expect(offlineBrowse.fromCache).toBe(true);
    expect(offlineBrowse.data.map((c) => c.id)).toEqual(["c1", "c2"]);

    // 3. Offline: wishlist edits are local and durable.
    const sent: string[] = [];
    const remote: WishlistRemote = {
      add: vi.fn(async (id: string) => {
        sent.push(`add:${id}`);
      }),
      remove: vi.fn(async (id: string) => {
        sent.push(`remove:${id}`);
      }),
    };
    const engine = new WishlistSyncEngine({
      wishlist: services.wishlist,
      queue: services.queue,
      remote,
    });

    await engine.add("c1");
    await engine.add("c2");
    await engine.remove("c2");
    expect(sent).toEqual([]);
    expect(await services.wishlist.list()).toEqual(["c1"]);

    // 4. Connectivity is restored: queued mutations flush without duplicates.
    const monitor = createConnectivityMonitor(createManualConnectivitySource());
    bindSyncOnReconnect(monitor, { engine });
    monitor.setOnline(true);

    await vi.waitFor(async () => {
      expect(await services.queue.pending()).toEqual([]);
    });
    expect(sent).toEqual(["add:c1", "remove:c2"]);

    // The reopened wishlist reflects the offline edit.
    expect(await services.wishlist.list()).toEqual(["c1"]);
  });

  it("handles the empty-cache offline path gracefully", async () => {
    const repository = new CampaignRepository(
      getOfflineServices(createMemoryStorage()).cache,
    );

    const result = await repository.loadList(
      async () => {
        throw new Error("offline");
      },
      { fallback: [] },
    );

    expect(result.fromCache).toBe(true);
    expect(result.data).toEqual([]);
  });
});
