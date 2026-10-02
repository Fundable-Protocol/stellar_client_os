import { describe, expect, it, vi } from "vitest";
import { createMemoryStorage } from "../storage";
import {
  WishlistSyncEngine,
  WishlistSyncQueue,
  bindSyncOnReconnect,
  createConnectivityMonitor,
  createManualConnectivitySource,
  type WishlistRemote,
} from "../sync";
import { OfflineWishlist } from "../wishlist";

function createRemote() {
  const calls: string[] = [];
  const remote: WishlistRemote = {
    add: vi.fn(async (campaignId: string) => {
      calls.push(`add:${campaignId}`);
    }),
    remove: vi.fn(async (campaignId: string) => {
      calls.push(`remove:${campaignId}`);
    }),
  };
  return { remote, calls };
}

describe("WishlistSyncQueue", () => {
  it("collapses repeated operations for the same campaign to the latest one", async () => {
    const queue = new WishlistSyncQueue(createMemoryStorage(), {
      clock: () => 7,
    });

    await queue.enqueue("add", "camp-1");
    await queue.enqueue("remove", "camp-1");
    await queue.enqueue("add", "camp-2");

    expect(await queue.pending()).toEqual([
      { type: "remove", campaignId: "camp-1", queuedAt: 7 },
      { type: "add", campaignId: "camp-2", queuedAt: 7 },
    ]);
  });

  it("markSynced drops only the flushed campaigns", async () => {
    const queue = new WishlistSyncQueue(createMemoryStorage());
    await queue.enqueue("add", "camp-1");
    await queue.enqueue("add", "camp-2");

    await queue.markSynced(["camp-1"]);

    expect((await queue.pending()).map((op) => op.campaignId)).toEqual([
      "camp-2",
    ]);
  });
});

describe("WishlistSyncEngine", () => {
  it("flushes queued mutations exactly once per campaign", async () => {
    const storage = createMemoryStorage();
    const wishlist = new OfflineWishlist(storage);
    const queue = new WishlistSyncQueue(storage);
    const { remote } = createRemote();
    const engine = new WishlistSyncEngine({ wishlist, queue, remote });

    await engine.add("camp-1");
    await engine.add("camp-1");
    await engine.add("camp-2");
    await engine.remove("camp-2");

    const result = await engine.sync();

    expect(result).toEqual({ attempted: 2, synced: 2, failed: 0 });
    expect(remote.add).toHaveBeenCalledTimes(1);
    expect(remote.add).toHaveBeenCalledWith("camp-1");
    expect(remote.remove).toHaveBeenCalledTimes(1);
    expect(remote.remove).toHaveBeenCalledWith("camp-2");
    expect(await queue.pending()).toEqual([]);
  });

  it("keeps failed operations queued for the next attempt", async () => {
    const storage = createMemoryStorage();
    const wishlist = new OfflineWishlist(storage);
    const queue = new WishlistSyncQueue(storage);
    const { remote } = createRemote();
    (remote.add as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("offline"),
    );
    const onSyncError = vi.fn();
    const engine = new WishlistSyncEngine({
      wishlist,
      queue,
      remote,
      onSyncError,
    });

    await engine.add("camp-1");

    const first = await engine.sync();
    expect(first).toEqual({ attempted: 1, synced: 0, failed: 1 });
    expect(onSyncError).toHaveBeenCalledTimes(1);
    expect(await queue.pending()).toHaveLength(1);

    const second = await engine.sync();
    expect(second).toEqual({ attempted: 1, synced: 1, failed: 0 });
    expect(await queue.pending()).toEqual([]);
  });
});

describe("sync on reconnect", () => {
  it("flushes the queue when connectivity is restored and not before", async () => {
    const storage = createMemoryStorage();
    const wishlist = new OfflineWishlist(storage);
    const queue = new WishlistSyncQueue(storage);
    const { remote } = createRemote();
    const engine = new WishlistSyncEngine({ wishlist, queue, remote });

    const source = createManualConnectivitySource(false);
    const monitor = createConnectivityMonitor(source);
    const onReconnect = vi.fn();
    const unbind = bindSyncOnReconnect(monitor, { engine, onReconnect });

    await engine.add("camp-1");
    await engine.add("camp-2");
    await engine.remove("camp-2");

    expect(remote.add).not.toHaveBeenCalled();

    monitor.setOnline(true);

    await vi.waitFor(async () => {
      expect(await queue.pending()).toEqual([]);
    });

    expect(remote.add).toHaveBeenCalledTimes(1);
    expect(remote.add).toHaveBeenCalledWith("camp-1");
    expect(remote.remove).toHaveBeenCalledTimes(1);
    expect(remote.remove).toHaveBeenCalledWith("camp-2");
    expect(onReconnect).toHaveBeenCalledTimes(1);

    unbind();
  });

  it("ignores redundant online signals", async () => {
    const storage = createMemoryStorage();
    const queue = new WishlistSyncQueue(storage);
    const { remote } = createRemote();
    const engine = new WishlistSyncEngine({
      wishlist: new OfflineWishlist(storage),
      queue,
      remote,
    });
    const monitor = createConnectivityMonitor();

    bindSyncOnReconnect(monitor, { engine });

    await engine.add("camp-1");
    monitor.setOnline(true);
    await vi.waitFor(async () => {
      expect(await queue.pending()).toEqual([]);
    });
    monitor.setOnline(true);

    // A second "online" event must not resend the already-flushed operation.
    expect(remote.add).toHaveBeenCalledTimes(1);
  });
});
