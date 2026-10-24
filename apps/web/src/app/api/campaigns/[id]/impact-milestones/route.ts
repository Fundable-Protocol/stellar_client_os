import { getCampaign } from "@/services/campaign.service";
import { campaignWebhookService } from "@/services/campaign-webhook.service";
import {
  campaignMilestoneEmailService,
  computeImpactMetrics,
  determineReachedMilestones,
  MILESTONE_EMAIL_DEFINITIONS,
  type CampaignMilestoneEmail,
} from "@/services/campaign-milestone-email.service";
import type { ImpactMilestone } from "@/types/campaign-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaign = await getCampaign(id);

  if (!campaign) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  const reached: ImpactMilestone[] = [];
  const treeCount = campaign.treeCount ?? 0;
  const co2 = Number(campaign.co2Sequestration ?? 0);

  if (treeCount >= 1000) reached.push("1000_trees");
  if (treeCount >= 5000) reached.push("5000_trees");
  if (co2 >= 10) reached.push("10_tons_co2");

  const impactMetrics = computeImpactMetrics(campaign);
  const reachedEmailMilestones = determineReachedMilestones(impactMetrics);

  return Response.json({
    campaignId: id,
    treeCount,
    co2Sequestration: campaign.co2Sequestration ?? "0",
    reachedMilestones: reached,
    impactMetrics,
    reachedEmailMilestones,
    definitions: [
      { milestone: "1000_trees", target: 1000, unit: "trees", achieved: treeCount >= 1000 },
      { milestone: "5000_trees", target: 5000, unit: "trees", achieved: treeCount >= 5000 },
      { milestone: "10_tons_co2", target: 10, unit: "metric_tonnes_co2", achieved: co2 >= 10 },
    ],
    emailMilestoneDefinitions: MILESTONE_EMAIL_DEFINITIONS,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaign = await getCampaign(id);

  if (!campaign) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    treeCount?: number;
    co2Sequestration?: string | number;
    previouslyTriggered?: ImpactMilestone[];
    previouslyTriggeredEmailMilestones?: CampaignMilestoneEmail[];
  };

  const treeCount = body.treeCount ?? campaign.treeCount ?? 0;
  const co2 = body.co2Sequestration ?? campaign.co2Sequestration ?? null;
  const previouslyTriggered = body.previouslyTriggered ?? [];

  const newlyTriggered = await campaignWebhookService.checkAndDispatchImpactMilestones(
    id,
    treeCount,
    co2,
    previouslyTriggered
  );

  // Email the campaign creator for any newly reached email milestones.
  const previousEmailMilestones =
    body.previouslyTriggeredEmailMilestones ??
    ((campaign as { triggeredModObserverMilestones?: CampaignMilestoneEmail[] })
      .triggeredModObserverMilestones ?? []);

  const emailResult = await campaignMilestoneEmailService.checkAndSendMilestoneEmails(
    id,
    previousEmailMilestones,
  );

  return Response.json({
    campaignId: id,
    treeCount,
    co2Sequestration: co2,
    newlyTriggered,
    emailMilestones: {
      newlyTriggered: emailResult.newlyTriggered,
      sent: emailResult.sent.map((p) => p.milestone),
      skipped: emailResult.skipped,
    },
  });
}
