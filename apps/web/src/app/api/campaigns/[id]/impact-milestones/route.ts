import { getCampaign } from "@/services/campaign.service";
import { campaignWebhookService } from "@/services/campaign-webhook.service";
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

  return Response.json({
    campaignId: id,
    treeCount,
    co2Sequestration: campaign.co2Sequestration ?? "0",
    reachedMilestones: reached,
    definitions: [
      { milestone: "1000_trees", target: 1000, unit: "trees", achieved: treeCount >= 1000 },
      { milestone: "5000_trees", target: 5000, unit: "trees", achieved: treeCount >= 5000 },
      { milestone: "10_tons_co2", target: 10, unit: "metric_tonnes_co2", achieved: co2 >= 10 },
    ],
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

  return Response.json({
    campaignId: id,
    treeCount,
    co2Sequestration: co2,
    newlyTriggered,
  });
}