import { describe, it, expect, beforeEach } from "vitest";
import {
  CampaignABTestingService,
} from "./campaign-ab-testing.service";

describe("CampaignABTestingService", () => {
  let service: CampaignABTestingService;

  beforeEach(() => {
    service = new CampaignABTestingService();
  });

  describe("Traffic Split", () => {
    it("generates 50/50 split by default for two variants", () => {
      const split = service.generateDefaultSplit(["var-1", "var-2"]);
      expect(split["var-1"]).toBe(50);
      expect(split["var-2"]).toBe(50);
      expect(service.validateTrafficSplit(split, ["var-1", "var-2"])).toBe(true);
    });

    it("generates equal split for three variants summing to 100", () => {
      const split = service.generateDefaultSplit(["var-1", "var-2", "var-3"]);
      const sum = split["var-1"] + split["var-2"] + split["var-3"];
      expect(sum).toBe(100);
      expect(service.validateTrafficSplit(split, ["var-1", "var-2", "var-3"])).toBe(true);
    });

    it("validates custom traffic split correctly", () => {
      expect(service.validateTrafficSplit({ "v1": 70, "v2": 30 }, ["v1", "v2"])).toBe(true);
      expect(service.validateTrafficSplit({ "v1": 60, "v2": 30 }, ["v1", "v2"])).toBe(false);
      expect(service.validateTrafficSplit({ "v1": -10, "v2": 110 }, ["v1", "v2"])).toBe(false);
      expect(service.validateTrafficSplit({ "v1": 50 }, ["v1", "v2"])).toBe(false);
    });

    it("updates traffic split successfully", () => {
      const test = service.createTest({
        campaignId: "camp-1",
        variants: [
          { name: "Headline A", headline: "Clean Earth", heroImageUrl: "https://img.com/a.jpg", ctaText: "Plant Now" },
          { name: "Headline B", headline: "Green Future", heroImageUrl: "https://img.com/b.jpg", ctaText: "Join Movement" },
        ],
      });

      const [v1, v2] = test.variants;
      const updated = service.updateTrafficSplit(test.id, {
        [v1.id]: 70,
        [v2.id]: 30,
      });

      expect(updated.trafficSplit[v1.id]).toBe(70);
      expect(updated.trafficSplit[v2.id]).toBe(30);
    });
  });

  describe("Traffic Routing", () => {
    it("routes traffic according to 50/50 split", () => {
      const test = service.createTest({
        campaignId: "camp-1",
        variants: [
          { name: "A", headline: "H1", heroImageUrl: "https://img/1.png", ctaText: "CTA 1" },
          { name: "B", headline: "H2", heroImageUrl: "https://img/2.png", ctaText: "CTA 2" },
        ],
      });

      const [v1, v2] = test.variants;
      // Below 50% routes to v1
      const route1 = service.routeTraffic(test, 0.25);
      expect(route1.id).toBe(v1.id);

      // Above 50% routes to v2
      const route2 = service.routeTraffic(test, 0.75);
      expect(route2.id).toBe(v2.id);
    });

    it("always routes 100% traffic to locked winner", () => {
      const test = service.createTest({
        campaignId: "camp-1",
        variants: [
          { name: "A", headline: "H1", heroImageUrl: "https://img/1.png", ctaText: "CTA 1" },
          { name: "B", headline: "H2", heroImageUrl: "https://img/2.png", ctaText: "CTA 2" },
        ],
      });

      const [, v2] = test.variants;
      service.lockWinner(test.id, v2.id);

      // Even with random 0.05 (which normally maps to v1), locked winner is returned
      const routed = service.routeTraffic(test, 0.05);
      expect(routed.id).toBe(v2.id);
    });
  });

  describe("Winner Locking & Significance", () => {
    it("allows creator to lock and unlock winner manually", () => {
      const test = service.createTest({
        campaignId: "camp-1",
        variants: [
          { name: "Control", headline: "H1", heroImageUrl: "img1", ctaText: "CTA1" },
          { name: "Challenger", headline: "H2", heroImageUrl: "img2", ctaText: "CTA2" },
        ],
        winnerSelectionMode: "manual",
      });

      const [v1] = test.variants;
      const locked = service.lockWinner(test.id, v1.id);
      expect(locked.lockedWinnerId).toBe(v1.id);
      expect(locked.status).toBe("concluded");
      expect(locked.concludedAt).toBeDefined();

      const unlocked = service.unlockWinner(test.id);
      expect(unlocked.lockedWinnerId).toBeNull();
      expect(unlocked.status).toBe("active");
    });

    it("reports insufficient data if sample size is below minimum", () => {
      const test = service.createTest({
        campaignId: "camp-1",
        variants: [
          { name: "Control", headline: "H1", heroImageUrl: "img1", ctaText: "CTA1" },
          { name: "Challenger", headline: "H2", heroImageUrl: "img2", ctaText: "CTA2" },
        ],
        minSampleSize: 100,
      });

      const [v1, v2] = test.variants;
      // Record 50 impressions on v1 and v2
      for (let i = 0; i < 50; i++) {
        service.recordImpression(test.id, v1.id);
        service.recordImpression(test.id, v2.id);
      }
      service.recordConversion(test.id, v1.id);

      const result = service.evaluateSignificance(test.id);
      expect(result.sufficientData).toBe(false);
      expect(result.isSignificant).toBe(false);
      expect(result.recommendation).toContain("Sample size too small");
    });

    it("auto-selects winner when statistically significant in significance mode", () => {
      const test = service.createTest({
        campaignId: "camp-auto",
        variants: [
          { name: "Variant A", headline: "H1", heroImageUrl: "img1", ctaText: "CTA1" },
          { name: "Variant B", headline: "H2", heroImageUrl: "img2", ctaText: "CTA2" },
        ],
        winnerSelectionMode: "significance",
        minSampleSize: 100,
        significanceThreshold: 0.95,
      });

      const [vA, vB] = test.variants;

      // Simulate 200 impressions for A with 10 conversions (5% CR)
      for (let i = 0; i < 200; i++) {
        service.recordImpression(test.id, vA.id);
      }
      for (let i = 0; i < 10; i++) {
        service.recordConversion(test.id, vA.id);
      }

      // Simulate 200 impressions for B with 40 conversions (20% CR) - highly significant difference
      for (let i = 0; i < 200; i++) {
        service.recordImpression(test.id, vB.id);
      }
      for (let i = 0; i < 40; i++) {
        service.recordConversion(test.id, vB.id);
      }

      const updatedTest = service.getTest(test.id)!;
      expect(updatedTest.lockedWinnerId).toBe(vB.id);
      expect(updatedTest.status).toBe("concluded");

      const sigResult = service.evaluateSignificance(test.id);
      expect(sigResult.isSignificant).toBe(true);
      expect(sigResult.winnerVariantId).toBe(vB.id);
      expect(sigResult.confidence).toBeGreaterThan(0.95);
      expect(sigResult.recommendation).toContain("statistically significant winner");
    });
  });
});
