import { beforeEach, describe, expect, it } from "vitest";
import { getCampaignDataSource } from "./campaign.service";
import { CampaignSeoService } from "./campaign-seo.service";

const campaign = (id: string) => ({
  id,
  creator: "GCREATOR",
  name: id,
  goalAmount: "1000",
  raisedAmount: "0",
  sponsorCount: 0,
  treeCount: 0,
  status: "ACTIVE" as const,
  createdAt: 1,
  updatedAt: 1,
  statusChangedAt: 1,
  sponsors: [],
  statusHistory: [],
});

describe("CampaignSeoService", () => {
  let svc: CampaignSeoService;

  beforeEach(async () => {
    svc = new CampaignSeoService();
    await getCampaignDataSource().saveCampaign(campaign("seo-1"));
  });

  it("returns null before anything is saved", () => {
    expect(svc.getSeo("seo-1")).toBeNull();
  });

  it("lets the creator save overrides (address match is case-insensitive)", async () => {
    const saved = await svc.saveSeo({
      campaignId: "seo-1",
      callerAddress: "gcreator",
      input: { title: "Plant 2,000 mangroves", description: "Help restore the coast.", ogImageUrl: "https://cdn.test/og.png" },
    });
    expect(saved).toMatchObject({ campaignId: "seo-1", title: "Plant 2,000 mangroves", ogImageUrl: "https://cdn.test/og.png" });
    expect(svc.getSeo("seo-1")?.description).toBe("Help restore the coast.");
  });

  it("rejects other callers, unknown campaigns and invalid input", async () => {
    await expect(svc.saveSeo({ campaignId: "seo-1", callerAddress: "GOTHER", input: { title: "x" } })).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
    await expect(svc.saveSeo({ campaignId: "missing", callerAddress: "GCREATOR", input: {} })).rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND" });
    await expect(svc.saveSeo({ campaignId: "seo-1", callerAddress: "GCREATOR", input: { ogImageUrl: "ftp://x" } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(svc.saveSeo({ campaignId: "seo-1", input: {} })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
