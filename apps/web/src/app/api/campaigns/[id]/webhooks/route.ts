import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { campaignWebhookService } from "@/services/campaign-webhook.service";

export const runtime = "nodejs";

const TreeVerifiedSchema = z.object({
  event: z.literal("tree_verified"),
  verificationId: z.string().min(1, "verificationId is required"),
  treeId: z.string().min(1, "treeId is required"),
  verifiedAt: z.string().optional(),
  verifier: z.string().optional(),
  nullifier: z.string().optional(),
  txHash: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const BatchVerifiedSchema = z.object({
  event: z.literal("batch_verified"),
  batchId: z.string().min(1, "batchId is required"),
  treeIds: z.array(z.string()).min(10, "batch_verified requires at least 10 verified trees"),
  verifiedAt: z.string().optional(),
  verifier: z.string().optional(),
  txHash: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const MilestoneReachedSchema = z.object({
  event: z.literal("campaign_milestone_reached"),
  eventId: z.string().min(1, "eventId is required"),
  campaignName: z.string().optional(),
  milestone: z.number().optional(),
  percentage: z.number().optional(),
  raisedAmount: z.string().optional(),
  goalAmount: z.string().optional(),
  treeCount: z.number().optional(),
});

const CampaignCompletedSchema = z.object({
  event: z.literal("campaign_completed"),
  completionId: z.string().min(1, "completionId is required"),
  completedAt: z.string().optional(),
  treeCount: z.number().optional(),
  raisedAmount: z.string().optional(),
  goalAmount: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const WebhookEventSchema = z.discriminatedUnion("event", [
  TreeVerifiedSchema,
  BatchVerifiedSchema,
  MilestoneReachedSchema,
  CampaignCompletedSchema,
]);

/**
 * POST /api/campaigns/[id]/webhooks
 *
 * Dispatches tree verification and milestone lifecycle webhooks for external integrations (Issue #873).
 * Supported events:
 * - tree_verified (individual tree)
 * - batch_verified (10+ trees batch)
 * - campaign_milestone_reached (funding / planting milestone)
 * - campaign_completed (completion event)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;

  try {
    const json = await request.json();
    const parsed = WebhookEventSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const nowIso = new Date().toISOString();

    switch (data.event) {
      case "tree_verified":
        await campaignWebhookService.treeVerified({
          campaignId,
          verificationId: data.verificationId,
          treeId: data.treeId,
          verifiedAt: data.verifiedAt || nowIso,
          verifier: data.verifier,
          nullifier: data.nullifier,
          txHash: data.txHash,
          metadata: data.metadata,
        });
        break;

      case "batch_verified":
        await campaignWebhookService.batchVerified({
          campaignId,
          batchId: data.batchId,
          treeIds: data.treeIds,
          verifiedAt: data.verifiedAt || nowIso,
          verifier: data.verifier,
          txHash: data.txHash,
          metadata: data.metadata,
        });
        break;

      case "campaign_milestone_reached":
        await campaignWebhookService.campaignMilestoneReached({
          campaignId,
          eventId: data.eventId,
          campaignName: data.campaignName,
          milestone: data.milestone,
          percentage: data.percentage,
          raisedAmount: data.raisedAmount,
          goalAmount: data.goalAmount,
          treeCount: data.treeCount,
        });
        break;

      case "campaign_completed":
        await campaignWebhookService.campaignCompleted({
          campaignId,
          completionId: data.completionId,
          completedAt: data.completedAt || nowIso,
          treeCount: data.treeCount,
          raisedAmount: data.raisedAmount,
          goalAmount: data.goalAmount,
          metadata: data.metadata,
        });
        break;
    }

    return NextResponse.json({
      success: true,
      event: data.event,
      campaignId,
      dispatchedAt: nowIso,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
