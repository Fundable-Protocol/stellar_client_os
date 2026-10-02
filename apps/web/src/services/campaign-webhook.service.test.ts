import { describe, expect, it, vi } from "vitest";
import { CampaignWebhookService } from "./campaign-webhook.service";

function createService() {
  const dispatchEvent = vi.fn().mockResolvedValue(undefined);
  return { service: new CampaignWebhookService({ dispatchEvent } as never), dispatchEvent };
}

describe("CampaignWebhookService", () => {
  it("publishes an individually verified tree with a stable event id", async () => {
    const { service, dispatchEvent } = createService();
    await service.treeVerified({
      verificationId: "verification-1",
      treeId: "tree-1",
      campaignId: "campaign-1",
      verifiedAt: "2026-09-26T00:00:00.000Z",
      nullifier: "nullifier-1",
    });

    expect(dispatchEvent).toHaveBeenCalledWith("tree_verified", expect.objectContaining({
      eventId: "verification-1",
      treeId: "tree-1",
      campaignId: "campaign-1",
    }));
  });

  it("rejects batches smaller than ten trees", async () => {
    const { service, dispatchEvent } = createService();
    await expect(service.batchVerified({
      batchId: "batch-1",
      campaignId: "campaign-1",
      treeIds: ["tree-1"],
      verifiedAt: "2026-09-26T00:00:00.000Z",
    })).rejects.toThrow("at least 10");
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("publishes a ten-tree batch with its batch id", async () => {
    const { service, dispatchEvent } = createService();
    await service.batchVerified({
      batchId: "batch-1",
      campaignId: "campaign-1",
      treeIds: Array.from({ length: 10 }, (_, index) => `tree-${index}`),
      verifiedAt: "2026-09-26T00:00:00.000Z",
    });

    expect(dispatchEvent).toHaveBeenCalledWith("batch_verified", expect.objectContaining({
      eventId: "batch-1",
      treeCount: 10,
    }));
  });

  it("publishes campaign completion with a stable completion id", async () => {
    const { service, dispatchEvent } = createService();
    await service.campaignCompleted({
      completionId: "completion-1",
      campaignId: "campaign-1",
      completedAt: "2026-09-26T00:00:00.000Z",
    });

    expect(dispatchEvent).toHaveBeenCalledWith("campaign_completed", expect.objectContaining({
      eventId: "completion-1",
    }));
  });

  it("publishes funding milestone reached event", async () => {
    const { service, dispatchEvent } = createService();
    await service.campaignMilestoneReached({
      eventId: "campaign-1:25",
      campaignId: "campaign-1",
      campaignName: "Test Campaign",
      percentage: 25,
      raisedAmount: "2500",
      goalAmount: "10000",
    });

    expect(dispatchEvent).toHaveBeenCalledWith("campaign_milestone_reached", expect.objectContaining({
      eventId: "campaign-1:25",
      campaignId: "campaign-1",
      percentage: 25,
    }));
  });

  it("publishes impact milestone reached event for trees and co2", async () => {
    const { service, dispatchEvent } = createService();
    await service.campaignImpactMilestoneReached({
      eventId: "campaign-1:impact:1000_trees",
      campaignId: "campaign-1",
      milestone: "1000_trees",
      treeCount: 1000,
      co2Sequestration: "5.2",
    });

    expect(dispatchEvent).toHaveBeenCalledWith("campaign_milestone_reached", {
      eventId: "campaign-1:impact:1000_trees",
      campaignId: "campaign-1",
      milestone: "1000_trees",
      treeCount: 1000,
      co2Sequestration: "5.2",
    });
  });

  it("evaluates and dispatches newly reached impact milestones", async () => {
    const { service, dispatchEvent } = createService();
    const triggered = await service.checkAndDispatchImpactMilestones("campaign-100", 5200, "12.5", []);

    expect(triggered).toEqual(["1000_trees", "5000_trees", "10_tons_co2"]);
    expect(dispatchEvent).toHaveBeenCalledTimes(3);
  });

  it("does not re-dispatch previously triggered impact milestones", async () => {
    const { service, dispatchEvent } = createService();
    const triggered = await service.checkAndDispatchImpactMilestones(
      "campaign-100",
      5200,
      "12.5",
      ["1000_trees", "5000_trees"]
    );

    expect(triggered).toEqual(["10_tons_co2"]);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledWith("campaign_milestone_reached", {
      eventId: "campaign-100:impact:10_tons_co2",
      campaignId: "campaign-100",
      milestone: "10_tons_co2",
      treeCount: 5200,
      co2Sequestration: "12.5",
    });
  });
});

