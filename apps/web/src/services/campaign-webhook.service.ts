import { WebhookService } from "@/services/webhook.service";
import type {
  BatchVerifiedEvent,
  CampaignCompletedEvent,
  CampaignImpactMilestoneEvent,
  CampaignMilestoneReachedEvent,
  ImpactMilestone,
  TreeVerifiedEvent,
} from "@/types/campaign-webhook";

/**
 * Publishes the campaign lifecycle events consumed by external integrations.
 * The event identifiers are intentionally supplied by the caller so replayed
 * indexer notifications are deduplicated by WebhookService.
 */
export class CampaignWebhookService {
  constructor(private readonly webhookService = new WebhookService()) {}

  async treeVerified(event: TreeVerifiedEvent): Promise<void> {
    this.assertRequired(event.verificationId, "verificationId");
    this.assertRequired(event.treeId, "treeId");
    this.assertRequired(event.campaignId, "campaignId");

    await this.webhookService.dispatchEvent("tree_verified", {
      ...event,
      eventId: event.verificationId,
    });
  }

  async batchVerified(event: BatchVerifiedEvent): Promise<void> {
    this.assertRequired(event.batchId, "batchId");
    this.assertRequired(event.campaignId, "campaignId");
    if (event.treeIds.length < 10) {
      throw new Error("batch_verified requires at least 10 verified trees");
    }

    await this.webhookService.dispatchEvent("batch_verified", {
      ...event,
      eventId: event.batchId,
      treeCount: event.treeIds.length,
    });
  }

  async campaignMilestoneReached(event: CampaignMilestoneReachedEvent): Promise<void> {
    this.assertRequired(event.eventId, "eventId");
    this.assertRequired(event.campaignId, "campaignId");

    await this.webhookService.dispatchEvent("campaign_milestone_reached", { ...event });
  }

  async campaignImpactMilestoneReached(event: CampaignImpactMilestoneEvent): Promise<void> {
    this.assertRequired(event.eventId, "eventId");
    this.assertRequired(event.campaignId, "campaignId");
    this.assertRequired(event.milestone, "milestone");

    await this.webhookService.dispatchEvent("campaign_milestone_reached", { ...event });
  }

  async checkAndDispatchImpactMilestones(
    campaignId: string,
    treeCount: number,
    co2Sequestration?: number | string | null,
    previouslyTriggered: ImpactMilestone[] = []
  ): Promise<ImpactMilestone[]> {
    this.assertRequired(campaignId, "campaignId");
    const triggered: ImpactMilestone[] = [];
    const co2Num =
      co2Sequestration !== null && co2Sequestration !== undefined
        ? Number(co2Sequestration)
        : 0;
    const co2Str =
      co2Sequestration !== null && co2Sequestration !== undefined
        ? String(co2Sequestration)
        : null;

    if (treeCount >= 1000 && !previouslyTriggered.includes("1000_trees")) {
      await this.campaignImpactMilestoneReached({
        eventId: `${campaignId}:impact:1000_trees`,
        campaignId,
        milestone: "1000_trees",
        treeCount,
        co2Sequestration: co2Str,
      });
      triggered.push("1000_trees");
    }

    if (treeCount >= 5000 && !previouslyTriggered.includes("5000_trees")) {
      await this.campaignImpactMilestoneReached({
        eventId: `${campaignId}:impact:5000_trees`,
        campaignId,
        milestone: "5000_trees",
        treeCount,
        co2Sequestration: co2Str,
      });
      triggered.push("5000_trees");
    }

    if (!isNaN(co2Num) && co2Num >= 10 && !previouslyTriggered.includes("10_tons_co2")) {
      await this.campaignImpactMilestoneReached({
        eventId: `${campaignId}:impact:10_tons_co2`,
        campaignId,
        milestone: "10_tons_co2",
        treeCount,
        co2Sequestration: co2Str,
      });
      triggered.push("10_tons_co2");
    }

    return triggered;
  }

  async campaignCompleted(event: CampaignCompletedEvent): Promise<void> {
    this.assertRequired(event.completionId, "completionId");
    this.assertRequired(event.campaignId, "campaignId");

    await this.webhookService.dispatchEvent("campaign_completed", {
      ...event,
      eventId: event.completionId,
    });
  }

  private assertRequired(value: string, field: string): void {
    if (!value.trim()) throw new Error(`${field} is required`);
  }
}

export const campaignWebhookService = new CampaignWebhookService();
