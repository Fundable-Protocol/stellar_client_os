import { describe, expect, it } from "vitest";
import { createCampaign, InMemoryCampaignDataSource } from "./campaign.service";
import { campaignDaysRemaining, InMemoryCampaignSearchProvider, popularCampaigns } from "./campaign-search.service";
import type { CampaignRecord } from "./campaign.service";

const DAY_MS = 24 * 60 * 60 * 1000;

function ids(results: Array<{ campaign: { id: string } }>): string[] {
  return results.map((result) => result.campaign.id);
}

describe("campaign full-text search", () => {
  it("matches species, location, and creator fields", async () => {
    const source = new InMemoryCampaignDataSource();
    await createCampaign({ id: "mangrove", creator: "alice", name: "Coastal recovery", description: "Restore wetlands", location: "Lagos", speciesTags: ["mangrove"], goalAmount: "100" }, source);
    await createCampaign({ id: "forest", creator: "bob", name: "Forest recovery", description: "Plant trees", location: "Nairobi", speciesTags: ["acacia"], goalAmount: "100" }, source);
    const search = new InMemoryCampaignSearchProvider(source);
    expect(ids(await search.search({ query: "mangrove" }))).toEqual(["mangrove"]);
    expect((await search.search({ query: "recovery", location: "Lagos", creator: "alice" })).length).toBe(1);
  });

  it("searches across title, description, and tags", async () => {
    const source = new InMemoryCampaignDataSource();
    await createCampaign({ id: "title", creator: "a", name: "Mangrove nursery", description: "Seedlings", goalAmount: "100" }, source);
    await createCampaign({ id: "desc", creator: "b", name: "Coastal project", description: "Planting mangrove seedlings", goalAmount: "100" }, source);
    await createCampaign({ id: "tag", creator: "c", name: "Coastal project", description: "Seedlings", speciesTags: ["mangrove"], goalAmount: "100" }, source);
    const search = new InMemoryCampaignSearchProvider(source);
    expect(ids(await search.search({ query: "mangrove" })).sort()).toEqual(["desc", "tag", "title"]);
  });

  it("ranks title matches above description-only matches", async () => {
    const source = new InMemoryCampaignDataSource();
    await createCampaign({ id: "desc-only", creator: "a", name: "Coastal project", description: "Restore mangrove wetlands", goalAmount: "100" }, source);
    await createCampaign({ id: "title-hit", creator: "b", name: "Mangrove recovery", description: "Restore wetlands", goalAmount: "100" }, source);
    const search = new InMemoryCampaignSearchProvider(source);
    const results = await search.search({ query: "mangrove" });
    expect(ids(results)).toEqual(["title-hit", "desc-only"]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("combines category, funding goal range, and days remaining filters", async () => {
    const source = new InMemoryCampaignDataSource();
    const now = Date.now();
    await createCampaign({ id: "match", creator: "a", name: "Rainforest guards", category: "Environmental & Reforestation", goalAmount: "5000", durationMs: 10 * DAY_MS }, source);
    await createCampaign({ id: "wrong-category", creator: "b", name: "Rainforest guards", category: "Education & Literacy", goalAmount: "5000", durationMs: 10 * DAY_MS }, source);
    await createCampaign({ id: "goal-too-low", creator: "c", name: "Rainforest guards", category: "Environmental & Reforestation", goalAmount: "100", durationMs: 10 * DAY_MS }, source);
    await createCampaign({ id: "too-late", creator: "d", name: "Rainforest guards", category: "Environmental & Reforestation", goalAmount: "5000", durationMs: 120 * DAY_MS }, source);
    const search = new InMemoryCampaignSearchProvider(source);
    const results = await search.search({
      query: "rainforest",
      category: "environmental",
      minGoalAmount: "1000",
      maxGoalAmount: "10000",
      maxDaysRemaining: 30,
    });
    expect(ids(results)).toEqual(["match"]);
    expect(campaignDaysRemaining(results[0].campaign, now)).toBeLessThanOrEqual(30);
  });

  it("returns ranked results within the 500 ms budget", async () => {
    const source = new InMemoryCampaignDataSource();
    await Promise.all(
      Array.from({ length: 2000 }, (_, index) =>
        createCampaign({
          id: `c${index}`,
          creator: `creator-${index % 50}`,
          name: `Reforestation campaign ${index}`,
          description: index % 3 === 0 ? "Mangrove restoration along tropical coastlines" : "Community tree planting drive",
          location: index % 2 === 0 ? "Nairobi" : "Lagos",
          speciesTags: index % 5 === 0 ? ["mangrove"] : ["acacia"],
          goalAmount: String(1000 + index),
        }, source),
      ),
    );
    const search = new InMemoryCampaignSearchProvider(source);
    const startedAt = performance.now();
    const results = await search.search({ query: "mangrove", location: "Lagos" });
    const elapsed = performance.now() - startedAt;
    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });
});

describe("popular campaign suggestions", () => {
  it("orders by sponsor count then amount raised", () => {
    const base = { status: "ACTIVE", sponsors: [], statusHistory: [], createdAt: 0, updatedAt: 0, statusChangedAt: 0, treeCount: 0, goalAmount: "100" } as unknown as CampaignRecord;
    const campaigns: CampaignRecord[] = [
      { ...base, id: "low", sponsorCount: 1, raisedAmount: "10" },
      { ...base, id: "high-sponsors", sponsorCount: 9, raisedAmount: "10" },
      { ...base, id: "high-raised", sponsorCount: 9, raisedAmount: "9999" },
    ];
    expect(popularCampaigns(campaigns).map((campaign) => campaign.id)).toEqual(["high-raised", "high-sponsors", "low"]);
  });

  it("caps the number of suggestions", () => {
    const base = { status: "ACTIVE", sponsors: [], statusHistory: [], createdAt: 0, updatedAt: 0, statusChangedAt: 0, treeCount: 0, goalAmount: "100" } as unknown as CampaignRecord;
    const campaigns = Array.from({ length: 10 }, (_, index) => ({ ...base, id: `c${index}`, sponsorCount: index, raisedAmount: "1" }));
    expect(popularCampaigns(campaigns, 3)).toHaveLength(3);
  });
});
