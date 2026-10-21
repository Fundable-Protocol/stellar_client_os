import { beforeEach, describe, expect, it } from "vitest";
import { getCampaignDataSource } from "./campaign.service";
import { CampaignInvestmentTermsService } from "./campaign-investment-terms.service";

const campaign = (id: string) => ({
  id,
  creator: "GCREATOR",
  name: id,
  goalAmount: "50000",
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

const validTerms = {
  revenueSharePercent: 10,
  projectedAnnualRevenue: 200_000,
  fundingGoal: 50_000,
  termYears: 5,
};

describe("CampaignInvestmentTermsService", () => {
  let svc: CampaignInvestmentTermsService;

  beforeEach(async () => {
    svc = new CampaignInvestmentTermsService();
    await getCampaignDataSource().saveCampaign(campaign("roi-1"));
  });

  it("stores creator terms and clears them", async () => {
    const saved = await svc.saveTerms({ campaignId: "roi-1", callerAddress: "GCREATOR", input: validTerms });
    expect(saved).toMatchObject({ campaignId: "roi-1", revenueSharePercent: 10, currency: "USDC", model: "revenue_share" });
    expect(svc.getTerms("roi-1")).toEqual(saved);

    expect(await svc.clearTerms({ campaignId: "roi-1", callerAddress: "GCREATOR" })).toBe(true);
    expect(svc.getTerms("roi-1")).toBeNull();
  });

  it("only allows the campaign creator", async () => {
    await expect(svc.saveTerms({ campaignId: "roi-1", callerAddress: "GBACKER", input: validTerms })).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
    await expect(svc.clearTerms({ campaignId: "roi-1", callerAddress: "GBACKER" })).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
  });

  it("returns field-level details for invalid terms", async () => {
    await expect(
      svc.saveTerms({ campaignId: "roi-1", callerAddress: "GCREATOR", input: { ...validTerms, revenueSharePercent: 150 } }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", details: { revenueSharePercent: expect.any(String) } });
  });
});
