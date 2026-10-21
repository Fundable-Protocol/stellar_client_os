import { randomUUID } from "crypto";
import { recordCampaignContribution } from "@/services/campaign.service";
import { creatorWebhookService } from "@/services/creator-webhook.service";
import { CampaignWebhookService } from "@/services/campaign-webhook.service";
import { CampaignMilestoneEmailService } from "@/services/campaign-milestone-email.service";
import { withCampaignApiRateLimit } from "@/middlewares/rate-limit.middleware";

export const runtime = "nodejs";

const webhookService = new CampaignWebhookService();
const milestoneEmailService = new CampaignMilestoneEmailService();

async function postContribution(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as { amount?: string; pledgeId?: string; txHash?: string };
    if (!body.amount) {
      return Response.json({ error: "amount is required" }, { status: 400 });
    }
    const result = await recordCampaignContribution(id, body.amount);
    if (!result) return Response.json({ error: "Campaign not found" }, { status: 404 });

    // Fire webhook events and sponsor milestone emails in parallel.
    // All are best-effort: failures must never fail a successful contribution.
    await Promise.all([
      dispatchMilestoneWebhooks(result.campaign, result.milestones),
      dispatchSponsorMilestoneEmails(result.campaign, result.milestones),
      dispatchCreatorWebhooks(result.campaign, result.milestones, {
        amount: body.amount,
        // A stable source id lets retried requests be deduplicated downstream.
        pledgeId: body.pledgeId ?? body.txHash ?? randomUUID(),
        txHash: body.txHash,
      }),
    ]);

    return Response.json({ ...result.campaign, milestones: result.milestones });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid contribution" },
      { status: 400 },
    );
  }
}

/**
 * Notify interested parties (backers, analytics tooling, etc.) about every
 * milestone a contribution just crossed. Best-effort: a webhook failure is
 * retried/dead-lettered by WebhookService and must never fail the contribution.
 */
async function dispatchMilestoneWebhooks(
  campaign: { id: string; name?: string; raisedAmount: string; goalAmount: string },
  milestones: number[],
): Promise<void> {
  for (const percentage of milestones) {
    try {
      await webhookService.campaignMilestoneReached({
        // Unique per (campaign, milestone) so idempotent delivery never
        // suppresses a later milestone of the same campaign.
        eventId: `${campaign.id}:${percentage}`,
        campaignId: campaign.id,
        campaignName: campaign.name,
        percentage,
        raisedAmount: campaign.raisedAmount,
        goalAmount: campaign.goalAmount,
      });
    } catch (error) {
      console.error(`[Milestone webhook] Failed to dispatch ${percentage}% for ${campaign.id}:`, error);
    }
  }
}

/**
 * Notify the creator's own webhook endpoint (#1220) of the pledge and of any
 * milestones it crossed. Best-effort, like the integration webhooks above.
 */
async function dispatchCreatorWebhooks(
  campaign: { id: string; creator: string; name?: string; raisedAmount: string; goalAmount: string; sponsorCount: number },
  milestones: number[],
  pledge: { amount: string; pledgeId: string; txHash?: string },
): Promise<void> {
  try {
    await creatorWebhookService.notify(campaign.creator, "pledge.created", {
      eventId: `${campaign.id}:pledge:${pledge.pledgeId}`,
      campaignId: campaign.id,
      campaignName: campaign.name,
      pledgeId: pledge.pledgeId,
      amount: pledge.amount,
      ...(pledge.txHash && { txHash: pledge.txHash }),
      raisedAmount: campaign.raisedAmount,
      goalAmount: campaign.goalAmount,
      sponsorCount: campaign.sponsorCount,
      pledgedAt: new Date().toISOString(),
    });
    for (const percentage of milestones) {
      await creatorWebhookService.notify(campaign.creator, "campaign.milestone_reached", {
        eventId: `${campaign.id}:milestone:${percentage}`,
        campaignId: campaign.id,
        campaignName: campaign.name,
        percentage,
        raisedAmount: campaign.raisedAmount,
        goalAmount: campaign.goalAmount,
      });
    }
  } catch (error) {
    console.error(`[Creator webhook] Failed to dispatch pledge events for ${campaign.id}:`, error);
  }
}

/**
 * Email every sponsor (backer) of the campaign for each newly crossed milestone.
 * (#915) Best-effort: failures are logged inside CampaignMilestoneEmailService
 * and must never propagate to the caller.
 */
async function dispatchSponsorMilestoneEmails(
  campaign: {
    id: string;
    name: string;
    treeCount: number;
    verifiedTreeCount?: number;
    co2Sequestration?: string;
    sponsorCount: number;
    raisedAmount: string;
    goalAmount: string;
    location?: string;
  },
  milestones: number[],
): Promise<void> {
  if (milestones.length === 0) return;
  try {
    await milestoneEmailService.notifySponsors(campaign, milestones);
  } catch (error) {
    console.error(`[Milestone sponsor email] Unexpected failure for campaign ${campaign.id}:`, error);
  }
}

export const POST = withCampaignApiRateLimit(postContribution);
