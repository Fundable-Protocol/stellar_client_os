import { WebhookService } from "@/services/webhook.service";
import type {
  BatchVerifiedEvent,
  CampaignCompletedEvent,
  CampaignMilestoneReachedEvent,
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
