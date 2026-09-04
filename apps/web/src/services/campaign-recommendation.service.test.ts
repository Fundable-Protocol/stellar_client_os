// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  calculateCampaignSimilarity,
  CampaignRecommendationService,
  type CampaignDataSource,
  type CampaignRecord,
} from "./campaign-recommendation.service";

const USDC = "CUSDC";

function makeCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "1",
    creator: "GCREATOR",
    token: USDC,
    targetAmount: "100000",
    minTarget: "50000",
    createdAt: 1000,
    deadline: 9000,
    totalRaised: "20000",
    status: "Active",
    ...overrides,
  };
}

function withCampaigns(campaigns: CampaignRecord[]): CampaignDataSource {
  return { getCampaigns: async () => campaigns };
}

describe("calculateCampaignSimilarity", () => {
  it("gives the highest score to campaigns with matching attributes", () => {
    const viewed = makeCampaign();
    const related = makeCampaign({ id: "related" });
    const unrelated = makeCampaign({
      id: "unrelated",
      token: "COTHER",
      targetAmount: "1000000000",
      minTarget: "500000000",
      createdAt: 1000,
      deadline: 86401000,
    });

    expect(calculateCampaignSimilarity(viewed, related).score).toBeGreaterThan(
      calculateCampaignSimilarity(viewed, unrelated).score
    );
    expect(calculateCampaignSimilarity(viewed, related).score).toBe(100);
  });

  it("exposes explainable component scores", () => {
    const result = calculateCampaignSimilarity(
      makeCampaign(),
      makeCampaign({ id: "other", token: "COTHER" })
    );
    expect(result.components.token).toBe(0);
    expect(result.components.target).toBe(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("CampaignRecommendationService", () => {
  it("returns up to five active campaigns and excludes the viewed campaign", async () => {
    const campaigns = [
      makeCampaign(),
      ...Array.from({ length: 6 }, (_, index) =>
        makeCampaign({ id: `candidate-${index}`, totalRaised: String(index + 1) })
      ),
      makeCampaign({ id: "completed", status: "Successful" }),
    ];
    const service = new CampaignRecommendationService({
      dataSource: withCampaigns(campaigns),
    });

    const result = await service.getRecommendations("1");

    expect(result.data).toHaveLength(5);
    expect(result.data.every((campaign) => campaign.id !== "1")).toBe(true);
    expect(result.data.every((campaign) => campaign.status === "Active")).toBe(true);
    expect(result.meta.total).toBe(6);
    expect(result.meta.evaluated).toBe(8);
  });

  it("supports a smaller limit and completed campaigns when requested", async () => {
    const campaigns = [
      makeCampaign(),
      makeCampaign({ id: "successful", status: "Successful" }),
      makeCampaign({ id: "failed", status: "Failed" }),
    ];
    const service = new CampaignRecommendationService({
      dataSource: withCampaigns(campaigns),
    });

    const result = await service.getRecommendations("1", {
      limit: 1,
      includeNonActive: true,
    });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(2);
  });

  it("uses a stable id tie-breaker", async () => {
    const service = new CampaignRecommendationService({
      dataSource: withCampaigns([
        makeCampaign(),
        makeCampaign({ id: "z" }),
        makeCampaign({ id: "a" }),
      ]),
    });

    const result = await service.getRecommendations("1");
    expect(result.data.map((campaign) => campaign.id)).toEqual(["a", "z"]);
  });

  it("throws when the viewed campaign does not exist", async () => {
    const service = new CampaignRecommendationService({
      dataSource: withCampaigns([makeCampaign()]),
    });

    await expect(service.getRecommendations("missing")).rejects.toThrow(
      "Campaign missing not found"
    );
  });
});
