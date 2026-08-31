// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PersonalizedCampaignRecommendationService } from "./personalized-campaign-recommendation.service";
import type { CampaignDataSource, CampaignRecord } from "./campaign-trending.service";

function campaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return { id: "campaign-1", creator: "GCREATOR", token: "CUSDC", targetAmount: "100000", minTarget: "50000", createdAt: 1000, deadline: 9000, totalRaised: "1000", status: "Active", ...overrides };
}
function source(campaigns: CampaignRecord[]): CampaignDataSource { return { getCampaigns: async () => campaigns }; }

describe("PersonalizedCampaignRecommendationService", () => {
  it("excludes campaigns the user has already backed", async () => {
    const service = new PersonalizedCampaignRecommendationService(source([campaign({ id: "backed", contributions: [{ contributor: "galice", amount: "10", timestamp: 1 }] }), campaign({ id: "new" })]));
    const result = await service.getRecommendations("GAlIcE");
    expect(result.data.map((item) => item.id)).toEqual(["new"]);
    expect(result.meta.backedCampaigns).toBe(1);
  });
  it("ranks followed creators ahead of otherwise equal candidates", async () => {
    const service = new PersonalizedCampaignRecommendationService(source([campaign({ id: "other", creator: "GOTHER" }), campaign({ id: "followed", creator: "GFOLLOWED" })]));
    const result = await service.getRecommendations("GALICE", { followedCreators: ["gfollowed"] });
    expect(result.data.map((item) => item.id)).toEqual(["followed", "other"]);
    expect(result.data[0].reasons).toContain("Created by someone you follow");
  });
  it("uses co-backer overlap as a collaborative-interest signal", async () => {
    const service = new PersonalizedCampaignRecommendationService(source([
      campaign({ id: "history", contributions: [{ contributor: "GALICE", amount: "10", timestamp: 1 }, { contributor: "GBOB", amount: "10", timestamp: 1 }] }),
      campaign({ id: "shared", token: "COTHER", contributions: [{ contributor: "GBOB", amount: "10", timestamp: 1 }] }),
      campaign({ id: "unshared", token: "COTHER", contributions: [{ contributor: "GCAROL", amount: "10", timestamp: 1 }] }),
    ]));
    const result = await service.getRecommendations("GALICE");
    expect(result.data[0].id).toBe("shared");
    expect(result.data[0].components.collaboratorInterest).toBe(1);
  });
  it("returns a deterministic popular-campaign fallback for new users", async () => {
    const service = new PersonalizedCampaignRecommendationService(source([campaign({ id: "less-raised", totalRaised: "10" }), campaign({ id: "more-raised", totalRaised: "20" })]));
    const result = await service.getRecommendations("GNEW");
    expect(result.meta.coldStart).toBe(true);
    expect(result.data.map((item) => item.id)).toEqual(["more-raised", "less-raised"]);
    expect(result.data[0].reasons).toContain("Popular active campaign");
  });
  it("limits results and rejects an empty address", async () => {
    const service = new PersonalizedCampaignRecommendationService(source([campaign({ id: "1" }), campaign({ id: "2" })]));
    await expect(service.getRecommendations(" ")).rejects.toThrow("User address is required");
    await expect(service.getRecommendations("GALICE", { limit: 1 })).resolves.toMatchObject({ data: [{ id: "1" }] });
  });
});