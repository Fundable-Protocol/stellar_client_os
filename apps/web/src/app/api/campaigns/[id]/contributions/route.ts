import { recordCampaignContribution } from "@/services/campaign.service";
import { WebhookService } from "@/services/webhook.service";

export const runtime = "nodejs";

const webhookService = new WebhookService();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as { amount?: string };
    if (!body.amount) {
      return Response.json({ error: "amount is required" }, { status: 400 });
    }
    const result = await recordCampaignContribution(id, body.amount);
    if (!result) return Response.json({ error: "Campaign not found" }, { status: 404 });

    await dispatchMilestoneWebhooks(result.campaign, result.milestones);

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
      await webhookService.dispatchEvent("campaign.milestone_reached", {
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
