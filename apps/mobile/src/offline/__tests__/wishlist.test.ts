import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../storage";
import { OfflineWishlist } from "../wishlist";

describe("OfflineWishlist", () => {
  it("adds and removes campaigns while offline and persists the result", async () => {
    const storage = createMemoryStorage();
    const wishlist = new OfflineWishlist(storage, { clock: () => 10 });

    await wishlist.add("camp-1");
    await wishlist.add("camp-2");
    await wishlist.remove("camp-1");

    expect(await wishlist.list()).toEqual(["camp-2"]);

    // A fresh instance over the same storage simulates an app restart.
    const reopened = new OfflineWishlist(storage);
    expect(await reopened.list()).toEqual(["camp-2"]);
    expect(await reopened.has("camp-2")).toBe(true);
    expect(await reopened.has("camp-1")).toBe(false);
  });

  it("is idempotent for repeated adds and removes", async () => {
    const wishlist = new OfflineWishlist(createMemoryStorage());

    expect((await wishlist.add("camp-1")).added).toBe(true);
    expect((await wishlist.add("camp-1")).added).toBe(false);
    expect(await wishlist.list()).toEqual(["camp-1"]);

    expect((await wishlist.remove("camp-1")).added).toBe(false);
    expect((await wishlist.remove("camp-1")).added).toBe(false);
    expect(await wishlist.list()).toEqual([]);
  });

  it("replaces the list, removing duplicates", async () => {
    const wishlist = new OfflineWishlist(createMemoryStorage());

    await wishlist.replace(["b", "a", "b"]);

    expect(await wishlist.list()).toEqual(["b", "a"]);
  });
});
