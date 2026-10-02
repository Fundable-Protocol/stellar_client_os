import { describe, expect, it, vi } from "vitest";
import {
  InMemoryCampaignDataSource,
  reachedImpactMilestones,
  type CampaignRecord,
  type ImpactMilestone,
} from "../campaign.service";

function mockCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "campaign-1",
    creator: "creator-1",
    name: "Test Campaign",
    status: "ACTIVE",
    goalAmount: "10000",
    raisedAmount: "0",
    sponsorCount: 0,
    treeCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    statusChangedAt: Date.now(),
    sponsors: [],
    statusHistory: [],
    ...overrides,
  };
}

describe("reachedImpactMilestones", () => {
  it("returns empty array when no milestones are reached", () => {
    const campaign = mockCampaign({ treeCount: 0 });
    expect(reachedImpactMilestones(campaign)).toEqual([]);
  });

  it("returns 1000_trees when tree count is exactly 1000", () => {
    const campaign = mockCampaign({ treeCount: 1000 });
    expect(reachedImpactMilestones(campaign)).toEqual(["1000_trees"]);
  });

  it("returns 1000_trees when tree count exceeds 1000", () => {
    const campaign = mockCampaign({ treeCount: 2500 });
    expect(reachedImpactMilestones(campaign)).toEqual(["1000_trees"]);
  });

  it("returns both 1000_trees and 5000_trees when tree count is 5000", () => {
    const campaign = mockCampaign({ treeCount: 5000 });
    expect(reachedImpactMilestones(campaign)).toEqual(["1000_trees", "5000_trees"]);
  });

  it("returns 10_tons_co2 when CO2 sequestration is exactly 10 tonnes", () => {
    const campaign = mockCampaign({ co2Sequestration: "10" });
    expect(reachedImpactMilestones(campaign)).toEqual(["10_tons_co2"]);
  });

  it("returns 10_tons_co2 when CO2 sequestration is 10.5 tonnes", () => {
    const campaign = mockCampaign({ co2Sequestration: "10.5" });
    expect(reachedImpactMilestones(campaign)).toEqual(["10_tons_co2"]);
  });

  it("returns all milestones when all thresholds are met", () => {
    const campaign = mockCampaign({ treeCount: 5000, co2Sequestration: "15.5" });
    expect(reachedImpactMilestones(campaign)).toEqual([
      "1000_trees",
      "5000_trees",
      "10_tons_co2",
    ]);
  });

  it("ignores invalid co2Sequestration values", () => {
    const campaign1 = mockCampaign({ treeCount: 5000, co2Sequestration: "invalid" });
    expect(reachedImpactMilestones(campaign1)).toEqual(["1000_trees", "5000_trees"]);

    const campaign2 = mockCampaign({ treeCount: 5000, co2Sequestration: undefined });
    expect(reachedImpactMilestones(campaign2)).toEqual(["1000_trees", "5000_trees"]);
  });

  it("ignores negative tree counts", () => {
    const campaign = mockCampaign({ treeCount: -100 });
    expect(reachedImpactMilestones(campaign)).toEqual([]);
  });
});

describe("InMemoryCampaignDataSource - impact milestone webhooks", () => {
  it("dispatches webhook when 1000_trees milestone is newly reached", async () => {
    const dispatchImpactEvent = vi.fn().mockResolvedValue(undefined);
    const dataSource = new InMemoryCampaignDataSource(dispatchImpactEvent);

    // Save campaign with no trees
    const campaign = mockCampaign({ treeCount: 0 });
    await dataSource.saveCampaign(campaign);

    // Update to 1000 trees
    await dataSource.saveCampaign({ ...campaign, treeCount: 1000 });

    expect(dispatchImpactEvent).toHaveBeenCalledWith("campaign_milestone_reached", {
      eventId: "campaign-1:impact:1000_trees",
      campaignId: "campaign-1",
      milestone: "1000_trees",
      treeCount: 1000,
      co2Sequestration: null,
    });
  });

  it("dispatches webhook when 5000_trees milestone is newly reached", async () => {
    const dispatchImpactEvent = vi.fn().mockResolvedValue(undefined);
    const dataSource = new InMemoryCampaignDataSource(dispatchImpactEvent);

    // Save campaign with 1000 trees
    const campaign = mockCampaign({ treeCount: 1000, impactMilestonesReached: ["1000_trees"] });
    await dataSource.saveCampaign(campaign);

    // Update to 5000 trees
    await dataSource.saveCampaign({ ...campaign, treeCount: 5000 });

    expect(dispatchImpactEvent).toHaveBeenCalledWith("campaign_milestone_reached", {
      eventId: "campaign-1:impact:5000_trees",
      campaignId: "campaign-1",
      milestone: "5000_trees",
      treeCount: 5000,
      co2Sequestration: null,
    });
  });

  it("dispatches webhook when 10_tons_co2 milestone is newly reached", async () => {
    const dispatchImpactEvent = vi.fn().mockResolvedValue(undefined);
    const dataSource = new InMemoryCampaignDataSource(dispatchImpactEvent);

    // Save campaign with 5 tonnes CO2
    const campaign = mockCampaign({ treeCount: 500, co2Sequestration: "5" });
    await dataSource.saveCampaign(campaign);

    // Update to 10 tonnes CO2
    await dataSource.saveCampaign({ ...campaign, co2Sequestration: "10.5" });

    expect(dispatchImpactEvent).toHaveBeenCalledWith("campaign_milestone_reached", {
      eventId: "campaign-1:impact:10_tons_co2",
      campaignId: "campaign-1",
      milestone: "10_tons_co2",
      treeCount: 500,
      co2Sequestration: "10.5",
    });
  });

  it("does not dispatch webhook for milestones already reached", async () => {
    const dispatchImpactEvent = vi.fn().mockResolvedValue(undefined);
    const dataSource = new InMemoryCampaignDataSource(dispatchImpactEvent);

    // Save campaign with 1000 trees already marked as reached
    const campaign = mockCampaign({ treeCount: 1000, impactMilestonesReached: ["1000_trees"] });
    await dataSource.saveCampaign(campaign);

    // Update tree count (still above 1000)
    await dataSource.saveCampaign({ ...campaign, treeCount: 1200 });

    // Should not dispatch again for 1000_trees
    expect(dispatchImpactEvent).not.toHaveBeenCalled();
  });

  it("dispatches multiple webhooks when multiple milestones are reached in one update", async () => {
    const dispatchImpactEvent = vi.fn().mockResolvedValue(undefined);
    const dataSource = new InMemoryCampaignDataSource(dispatchImpactEvent);

    // Save campaign with no trees
    const campaign = mockCampaign({ treeCount: 0 });
    await dataSource.saveCampaign(campaign);

    // Update to 5000 trees and 10 tonnes CO2 at once
    await dataSource.saveCampaign({
      ...campaign,
      treeCount: 5000,
      co2Sequestration: "10",
    });

    // Should dispatch 3 webhooks: 1000_trees, 5000_trees, 10_tons_co2
    expect(dispatchImpactEvent).toHaveBeenCalledTimes(3);
    expect(dispatchImpactEvent).toHaveBeenCalledWith("campaign_milestone_reached", {
      eventId: "campaign-1:impact:1000_trees",
      campaignId: "campaign-1",
      milestone: "1000_trees",
      treeCount: 5000,
      co2Sequestration: "10",
    });
    expect(dispatchImpactEvent).toHaveBeenCalledWith("campaign_milestone_reached", {
      eventId: "campaign-1:impact:5000_trees",
      campaignId: "campaign-1",
      milestone: "5000_trees",
      treeCount: 5000,
      co2Sequestration: "10",
    });
    expect(dispatchImpactEvent).toHaveBeenCalledWith("campaign_milestone_reached", {
      eventId: "campaign-1:impact:10_tons_co2",
      campaignId: "campaign-1",
      milestone: "10_tons_co2",
      treeCount: 5000,
      co2Sequestration: "10",
    });
  });

  it("persists impactMilestonesReached on campaign record", async () => {
    const dispatchImpactEvent = vi.fn().mockResolvedValue(undefined);
    const dataSource = new InMemoryCampaignDataSource(dispatchImpactEvent);

    // Save campaign with no trees
    const campaign = mockCampaign({ treeCount: 0 });
    await dataSource.saveCampaign(campaign);

    // Update to 1000 trees
    const updated = await dataSource.saveCampaign({ ...campaign, treeCount: 1000 });

    expect(updated.impactMilestonesReached).toEqual(["1000_trees"]);
  });

  it("continues to log errors but does not throw when webhook dispatch fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const dispatchImpactEvent = vi.fn().mockRejectedValue(new Error("Webhook service down"));
    const dataSource = new InMemoryCampaignDataSource(dispatchImpactEvent);

    const campaign = mockCampaign({ treeCount: 0 });
    await dataSource.saveCampaign(campaign);

    // Should not throw
    await expect(
      dataSource.saveCampaign({ ...campaign, treeCount: 1000 })
    ).resolves.toBeDefined();

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("[Impact milestone webhook] Failed"),
      expect.any(Error)
    );

    consoleError.mockRestore();
  });
});
