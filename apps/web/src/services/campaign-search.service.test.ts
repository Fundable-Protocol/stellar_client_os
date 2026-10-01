import { describe, expect, it } from "vitest";
import { createCampaign, InMemoryCampaignDataSource } from "./campaign.service";
import { InMemoryCampaignSearchProvider } from "./campaign-search.service";

describe("campaign full-text search", () => {
  it("matches species, location, and creator fields", async () => {
    const source = new InMemoryCampaignDataSource();
    await createCampaign({ id: "mangrove", creator: "alice", name: "Coastal recovery", description: "Restore wetlands", location: "Lagos", speciesTags: ["mangrove"], goalAmount: "100" }, source);
    await createCampaign({ id: "forest", creator: "bob", name: "Forest recovery", description: "Plant trees", location: "Nairobi", speciesTags: ["acacia"], goalAmount: "100" }, source);
    const search = new InMemoryCampaignSearchProvider(source);
    expect((await search.search({ query: "mangrove" })).map((result) => result.campaign.id)).toEqual(["mangrove"]);
    expect((await search.search({ query: "recovery", location: "Lagos", creator: "alice" })).length).toBe(1);
  });
});
