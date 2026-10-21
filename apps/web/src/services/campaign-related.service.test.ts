import { describe, expect, it } from "vitest";
import {
  getRelatedCampaigns,
  scoreRelatedCampaign,
  getCampaignTags,
  isActivelyFunding,
} from "./campaign-related.service";
import {
  InMemoryCampaignDataSource,
  type CampaignRecord,
  createCampaign,
} from "./campaign.service";

function createMockCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: overrides.id ?? "camp-test",
    creator: overrides.creator ?? "GCREATOR",
    name: overrides.name ?? "Test Campaign",
    description: overrides.description ?? "Description for test campaign",
    category: overrides.category ?? "Reforestation",
    speciesTags: overrides.speciesTags ?? ["oak", "pine"],
    status: overrides.status ?? "ACTIVE",
    goalAmount: overrides.goalAmount ?? "10000",
    raisedAmount: overrides.raisedAmount ?? "5000",
    sponsorCount: overrides.sponsorCount ?? 10,
    treeCount: overrides.treeCount ?? 100,
    createdAt: overrides.createdAt ?? Date.now() - 5 * 24 * 60 * 60 * 1000,
    updatedAt: overrides.updatedAt ?? Date.now(),
    statusChangedAt: overrides.statusChangedAt ?? Date.now(),
    sponsors: overrides.sponsors ?? [],
    statusHistory: overrides.statusHistory ?? [],
    ...overrides,
  };
}

describe("campaign-related.service", () => {
  describe("getCampaignTags", () => {
    it("extracts and deduplicates tags from category, speciesTags, species, and treeSpecies", () => {
      const campaign = createMockCampaign({
        category: "Climate",
        speciesTags: ["Mangrove", "Wetland"],
        species: "Mangrove",
        treeSpecies: "Red Mangrove",
      });

      const tags = getCampaignTags(campaign);
      expect(tags).toContain("climate");
      expect(tags).toContain("mangrove");
      expect(tags).toContain("wetland");
      expect(tags).toContain("red mangrove");
      // Check deduplication
      expect(tags.filter((t) => t === "mangrove")).toHaveLength(1);
    });
  });

  describe("isActivelyFunding", () => {
    it("returns true for ACTIVE campaigns", () => {
      expect(isActivelyFunding(createMockCampaign({ status: "ACTIVE" }))).toBe(true);
    });

    it("returns false for COMPLETED or FAILED campaigns", () => {
      expect(isActivelyFunding(createMockCampaign({ status: "COMPLETED" }))).toBe(false);
      expect(isActivelyFunding(createMockCampaign({ status: "FAILED" }))).toBe(false);
      expect(isActivelyFunding(createMockCampaign({ status: "DRAFT" }))).toBe(false);
    });
  });

  describe("scoreRelatedCampaign", () => {
    it("biases toward actively funding campaigns", () => {
      const target = createMockCampaign({ id: "target", category: "Oceans", speciesTags: ["coral"] });
      const activeCandidate = createMockCampaign({
        id: "active-1",
        category: "Oceans",
        speciesTags: ["coral"],
        status: "ACTIVE",
        raisedAmount: "4000",
        goalAmount: "10000",
      });
      const completedCandidate = createMockCampaign({
        id: "completed-1",
        category: "Oceans",
        speciesTags: ["coral"],
        status: "COMPLETED",
        raisedAmount: "10000",
        goalAmount: "10000",
      });

      const activeScore = scoreRelatedCampaign(target, activeCandidate).score;
      const completedScore = scoreRelatedCampaign(target, completedCandidate).score;

      expect(activeScore).toBeGreaterThan(completedScore);
    });

    it("matches same category or shared tags", () => {
      const target = createMockCampaign({ id: "target", category: "Agroforestry", speciesTags: ["cacao"] });
      const sameCategory = createMockCampaign({ id: "c1", category: "Agroforestry", speciesTags: ["coffee"] });
      const sharedTag = createMockCampaign({ id: "c2", category: "Farming", speciesTags: ["cacao"] });
      const unrelated = createMockCampaign({ id: "c3", category: "Crypto", speciesTags: ["solana"] });

      const scoreCategory = scoreRelatedCampaign(target, sameCategory).score;
      const scoreTag = scoreRelatedCampaign(target, sharedTag).score;
      const scoreUnrelated = scoreRelatedCampaign(target, unrelated).score;

      expect(scoreCategory).toBeGreaterThan(scoreUnrelated);
      expect(scoreTag).toBeGreaterThan(scoreUnrelated);
    });
  });

  describe("getRelatedCampaigns", () => {
    it("excludes the current campaign", async () => {
      const source = new InMemoryCampaignDataSource();
      const current = createMockCampaign({ id: "current-camp", category: "Forests" });
      const other1 = createMockCampaign({ id: "other-1", category: "Forests" });
      const other2 = createMockCampaign({ id: "other-2", category: "Forests" });

      await source.saveCampaign(current);
      await source.saveCampaign(other1);
      await source.saveCampaign(other2);

      const related = await getRelatedCampaigns("current-camp", { limit: 4 }, source);
      expect(related.some((c) => c.id === "current-camp")).toBe(false);
    });

    it("surfaces at least 4 related campaigns when available", async () => {
      const source = new InMemoryCampaignDataSource();
      const current = createMockCampaign({ id: "current", category: "Rainforest", speciesTags: ["amazon"] });

      // Create 6 candidates with same category or shared tags
      for (let i = 1; i <= 6; i++) {
        await source.saveCampaign(
          createMockCampaign({
            id: `related-${i}`,
            name: `Related Campaign ${i}`,
            category: i % 2 === 0 ? "Rainforest" : "Conservation",
            speciesTags: i % 2 !== 0 ? ["amazon"] : ["congo"],
            status: "ACTIVE",
            raisedAmount: String(i * 1000),
          })
        );
      }

      await source.saveCampaign(current);

      const related = await getRelatedCampaigns("current", { limit: 4 }, source);
      expect(related.length).toBeGreaterThanOrEqual(4);
      expect(related.every((c) => c.id !== "current")).toBe(true);
    });

    it("biases ranking towards actively funding campaigns over completed ones", async () => {
      const source = new InMemoryCampaignDataSource();
      const current = createMockCampaign({ id: "current", category: "Wetlands", speciesTags: ["delta"] });

      // Completed campaign with exact same category and tag
      const completed = createMockCampaign({
        id: "completed-camp",
        category: "Wetlands",
        speciesTags: ["delta"],
        status: "COMPLETED",
        raisedAmount: "10000",
        goalAmount: "10000",
      });

      // Active campaign with same category
      const active = createMockCampaign({
        id: "active-camp",
        category: "Wetlands",
        speciesTags: ["delta"],
        status: "ACTIVE",
        raisedAmount: "5000",
        goalAmount: "10000",
      });

      await source.saveCampaign(current);
      await source.saveCampaign(completed);
      await source.saveCampaign(active);

      const related = await getRelatedCampaigns("current", { limit: 4 }, source);
      expect(related[0].id).toBe("active-camp");
    });
  });
});
