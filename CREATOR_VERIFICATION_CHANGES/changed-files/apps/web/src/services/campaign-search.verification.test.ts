import { describe, expect, it } from "vitest";
import { createCampaign, InMemoryCampaignDataSource, type CampaignRecord } from "./campaign.service";
import { InMemoryCampaignSearchProvider } from "./campaign-search.service";
import { summarizeCreatorVerification } from "@/lib/creator-verification";

const VERIFIED = summarizeCreatorVerification({ emailVerified: true, phoneVerified: true, governmentIdVerified: true });
const PARTIAL = summarizeCreatorVerification({ emailVerified: true });

async function seed() {
  const source = new InMemoryCampaignDataSource(async () => {});
  await createCampaign({ id: "unverified", creator: "c1", name: "Mangrove recovery", goalAmount: "100" }, source, 1_000);
  await createCampaign({ id: "partial", creator: "c2", name: "Mangrove recovery", goalAmount: "100" }, source, 2_000);
  await createCampaign({ id: "verified", creator: "c3", name: "Mangrove recovery", goalAmount: "100" }, source, 3_000);
  const campaigns = await source.getCampaigns();
  for (const campaign of campaigns) {
    if (campaign.id === "verified") await source.saveCampaign({ ...campaign, creatorVerification: VERIFIED, updatedAt: 0 });
    if (campaign.id === "partial") await source.saveCampaign({ ...campaign, creatorVerification: PARTIAL, updatedAt: 5 });
    if (campaign.id === "unverified") await source.saveCampaign({ ...campaign, updatedAt: 10 });
  }
  return source;
}

describe("campaign search — creator verification", () => {
  it("surfaces the verification status of every result", async () => {
    const results = await new InMemoryCampaignSearchProvider(await seed()).search({ query: "mangrove" });
    const byId = new Map(results.map((result) => [result.campaign.id, result]));
    expect(byId.get("verified")?.verification).toMatchObject({ status: "verified", isVerified: true });
    expect(byId.get("partial")?.verification).toMatchObject({ status: "partial", verifiedCount: 1 });
    expect(byId.get("unverified")?.verification).toMatchObject({ status: "unverified", isVerified: false });
    expect(byId.get("verified")?.campaign.creatorVerification?.isVerified).toBe(true);
  });

  it("ranks verified, then partially verified creators first when relevance is equal", async () => {
    const results = await new InMemoryCampaignSearchProvider(await seed()).search({ query: "mangrove" });
    expect(results.map((result) => result.campaign.id)).toEqual(["verified", "partial", "unverified"]);
  });

  it("keeps relevance as the primary ranking signal", async () => {
    const source = await seed();
    await createCampaign({ id: "title-match", creator: "c4", name: "Coastal mangrove nursery", goalAmount: "100" }, source);
    await createCampaign(
      { id: "description-match", creator: "c3", name: "Coastal nursery", description: "Planting mangrove seedlings", goalAmount: "100" },
      source,
    );
    const results = await new InMemoryCampaignSearchProvider(source).search({ query: "coastal mangrove" });
    expect(results[0].campaign.id).toBe("title-match");
  });

  it("filters to verified creators only", async () => {
    const results = await new InMemoryCampaignSearchProvider(await seed()).search({ query: "", verifiedOnly: true });
    expect(results.map((result) => result.campaign.id)).toEqual(["verified"]);
  });

  it("uses a live resolver when provided", async () => {
    const resolver = (campaign: CampaignRecord) => (campaign.id === "unverified" ? VERIFIED : summarizeCreatorVerification());
    const results = await new InMemoryCampaignSearchProvider(await seed(), resolver).search({ query: "mangrove", verifiedOnly: true });
    expect(results.map((result) => result.campaign.id)).toEqual(["unverified"]);
  });
});
