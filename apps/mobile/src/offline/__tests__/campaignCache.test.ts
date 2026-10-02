import { describe, expect, it } from "vitest";
import { CampaignCache, CampaignRepository } from "../campaignCache";
import { createMemoryStorage } from "../storage";
import type { CampaignDetail, CampaignSummary } from "../types";

const summary = (id: string): CampaignSummary => ({
  id,
  name: `Campaign ${id}`,
  status: "active",
  goalAmount: "1000",
  raisedAmount: "10",
  treeCount: 5,
  sponsorCount: 1,
});

const detail = (id: string): CampaignDetail => ({
  ...summary(id),
  sponsors: [],
  verificationProgress: 40,
});

const networkFailure = (): Promise<never> =>
  Promise.reject(new Error("Network request failed"));

describe("CampaignCache + CampaignRepository", () => {
  it("writes the list then serves it back when the network fails", async () => {
    const storage = createMemoryStorage();
    const cache = new CampaignCache(storage, { clock: () => 1_000 });
    const repository = new CampaignRepository(cache);

    const fresh = [summary("a"), summary("b")];
    const online = await repository.loadList(async () => fresh);

    expect(online.fromCache).toBe(false);
    expect(online.data).toEqual(fresh);
    expect(await cache.readList()).toEqual({ data: fresh, cachedAt: 1_000 });

    const offline = await repository.loadList(networkFailure);

    expect(offline.fromCache).toBe(true);
    expect(offline.data).toEqual(fresh);
    expect(offline.cachedAt).toBe(1_000);
  });

  it("writes a detail then serves it back when the network fails", async () => {
    const storage = createMemoryStorage();
    const cache = new CampaignCache(storage, { clock: () => 42 });
    const repository = new CampaignRepository(cache);

    const fresh = detail("camp-1");
    await repository.loadDetail("camp-1", async () => fresh);

    const offline = await repository.loadDetail("camp-1", networkFailure);

    expect(offline.fromCache).toBe(true);
    expect(offline.data).toEqual(fresh);
    expect(offline.cachedAt).toBe(42);
  });

  it("returns an empty fallback (no throw) when offline with an empty cache", async () => {
    const repository = new CampaignRepository(
      new CampaignCache(createMemoryStorage()),
    );

    const result = await repository.loadList(networkFailure, { fallback: [] });

    expect(result).toEqual({ data: [], fromCache: true, cachedAt: null });
  });

  it("rethrows the network error when offline with an empty cache and no fallback", async () => {
    const repository = new CampaignRepository(
      new CampaignCache(createMemoryStorage()),
    );

    await expect(repository.loadList(networkFailure)).rejects.toThrow(
      "Network request failed",
    );
  });

  it("clears every cached entry in its namespace", async () => {
    const storage = createMemoryStorage();
    const cache = new CampaignCache(storage, { namespace: "test.offline" });
    const repository = new CampaignRepository(cache);

    await repository.loadList(async () => [summary("a")]);
    await repository.loadDetail("a", async () => detail("a"));

    await cache.clear();

    expect(await cache.readList()).toBeNull();
    expect(await cache.readDetail("a")).toBeNull();
  });

  it("isolates caches that use different namespaces", async () => {
    const storage = createMemoryStorage();
    const first = new CampaignCache(storage, { namespace: "account.1" });
    const second = new CampaignCache(storage, { namespace: "account.2" });

    await first.saveList([summary("a")]);

    expect(await first.readList()).not.toBeNull();
    expect(await second.readList()).toBeNull();
  });
});
