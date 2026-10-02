import { describe, expect, it, vi, beforeEach } from "vitest";
import { MlCampaignRecommendationService } from "./ml-campaign-recommendation.service";
import * as trendingServiceModule from "./campaign-trending.service";

describe("MlCampaignRecommendationService (Issue #870)", () => {
  let service: MlCampaignRecommendationService;

  const mockCampaigns = [
    {
      id: "camp-amazon",
      title: "Amazon Rainforest Protection",
      description: "Restoring native cedar and mahogany trees in South America",
      status: "Active",
      location: "Amazonas, Brazil",
      region: "South America",
      countries: ["BR"],
      treeSpecies: "Cedar, Mahogany",
      score: 80,
    },
    {
      id: "camp-congo",
      title: "Congo Basin Reforestation",
      description: "Combating deforestation and wildlife preservation",
      status: "Active",
      location: "Kinshasa, DRC",
      region: "Central Africa",
      countries: ["CD"],
      treeSpecies: "Ebony, Acacia",
      score: 60,
    },
    {
      id: "camp-mangrove",
      title: "Coastal Mangrove Shield",
      description: "Restoring coastal wetlands and storm barriers",
      status: "Active",
      location: "Sundarbans, Bangladesh",
      region: "South Asia",
      countries: ["BD"],
      treeSpecies: "Mangrove",
      score: 50,
    },
    {
      id: "camp-archived",
      title: "Old Completed Campaign",
      description: "Completed reforestation",
      status: "Completed",
      location: "Kenya",
      score: 10,
    },
  ];

  beforeEach(() => {
    service = new MlCampaignRecommendationService();
    vi.spyOn(trendingServiceModule, "getCampaignTrendingService").mockReturnValue({
      getCampaigns: vi.fn().mockResolvedValue(mockCampaigns),
    } as any);
  });

  it("filters out inactive/completed campaigns", async () => {
    const res = await service.getRecommendations({});
    const ids = res.data.map((c) => c.id);
    expect(ids).not.toContain("camp-archived");
    expect(ids.length).toBe(3);
  });

  it("excludes campaigns from pastPurchases", async () => {
    const res = await service.getRecommendations({
      pastPurchases: ["camp-amazon"],
    });
    const ids = res.data.map((c) => c.id);
    expect(ids).not.toContain("camp-amazon");
    expect(ids).toContain("camp-congo");
    expect(ids).toContain("camp-mangrove");
  });

  it("boosts campaigns matching tree species preferences", async () => {
    const res = await service.getRecommendations({
      treeSpeciesPreferences: ["mahogany", "cedar"],
    });
    expect(res.data[0].id).toBe("camp-amazon");
    expect(res.data[0].matchReasons).toContain("Matches tree species preferences");
    expect(res.data[0].mlScore).toBeGreaterThan(30);
  });

  it("boosts campaigns matching geographic interests", async () => {
    const res = await service.getRecommendations({
      geographicInterests: ["Central Africa", "DRC"],
    });
    expect(res.data[0].id).toBe("camp-congo");
    expect(res.data[0].matchReasons).toContain("Matches geographic interests");
  });

  it("boosts campaigns matching environmental cause alignments", async () => {
    const res = await service.getRecommendations({
      environmentalCauseAlignment: ["wetlands", "storm"],
    });
    expect(res.data[0].id).toBe("camp-mangrove");
    expect(res.data[0].matchReasons).toContain("Aligns with environmental causes");
  });

  it("combines multiple preference dimensions and ranks highest score first", async () => {
    const res = await service.getRecommendations({
      treeSpeciesPreferences: ["mangrove"],
      geographicInterests: ["Bangladesh"],
      environmentalCauseAlignment: ["wetlands"],
    });
    // camp-mangrove matches species (+30), geo (+25), and cause (+20) -> highest score
    expect(res.data[0].id).toBe("camp-mangrove");
    expect(res.data[0].matchReasons.length).toBe(3);
    expect(res.data[0].mlScore).toBeGreaterThan(res.data[1].mlScore);
  });
});
