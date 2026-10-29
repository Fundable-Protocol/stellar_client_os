import { randomUUID } from "crypto";
import { recordCampaignContribution } from "@/services/campaign.service";
import { creatorWebhookService } from "@/services/creator-webhook.service";
import { CampaignWebhookService } from "@/services/campaign-webhook.service";
import { CampaignMilestoneEmailService } from "@/services/campaign-milestone-email.service";
import { withCampaignApiRateLimit } from "@/middlewares/rate-limit.middleware";
import { externalWebhookService } from "@/services/external-webhook.service";

export const runtime = "nodejs";

const webhookService = new CampaignWebhookService();
const milestoneEmailService = new CampaignMilestoneEmailService();

// Pledge-level fraud signals. A contribution is considered suspicious when it
// shows circular funding (creator and backer share a funding source), a wallet
// created solely for this pledge, or timing that matches a burst of identical
// pledges. Scores are stored for admin review; they never block the pledge itself.
export interface FraudSignals {
  sharedFundingSource: boolean;
  freshWalletForSinglePledge: boolean;
  identicalTimingBurst: boolean;
}

export interface FraudAssessment {
  score: number; // 0..100
  signals: FraudSignals;
  flagged: boolean;
}

const FLAG_THRESHOLD = 50;

export function scoreFraudSignals(signals: FraudSignals): FraudAssessment {
  let score = 0;
  if (signals.sharedFundingSource) score += 50;
  if (signals.freshWalletForSinglePledge) score += 30;
  if (signals.identicalTimingBurst) score += 20;
  return { score, signals, flagged: score >= FLAG_THRESHOLD };
}

async function postContribution(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      amount?: string;
      pledgeId?: string;
      txHash?: string;
      backerWallet?: string;
      fundingSources?: string[];
      creatorFundingSources?: string[];
      walletCreatedAt?: string;
    };
    if (!body.amount) {
      return Response.json({ error: "amount is required" }, { status: 400 });
    }
    const result = await recordCampaignContribution(id, body.amount);
    if (!result) return Response.json({ error: "Campaign not found" }, { status: 404 });

    const fraud = assessContribution(body, result.campaign.creator);

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
      dispatchExternalWebhooks(result.campaign, result.milestones, {
        amount: body.amount,
        pledgeId: body.pledgeId ?? body.txHash ?? randomUUID(),
        txHash: body.txHash,
      }),
    ]);

    // Suspicious campaigns are withheld from leaderboard and matching pending review.
    const withheld = fraud.flagged;

    return Response.json({
      ...result.campaign,
      milestones: result.milestones,
      moderation: { riskScore: fraud.score, flagged: fraud.flagged, withheld },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid contribution" },
      { status: 400 },
    );
  }
}

/**
 * Derives fraud signals for a single pledge. Graph overlap is computed from the
 * supplied funding-source sets; wallet age is compared against the pledge time.
 */
export function assessContribution(
  body: { backerWallet?: string; fundingSources?: string[]; creatorFundingSources?: string[]; walletCreatedAt?: string },
  creatorWallet: string,
  now: Date = new Date(),
): FraudAssessment {
  const backerSources = new Set(body.fundingSources ?? []);
  const creatorSources = new Set(body.creatorFundingSources ?? []);
  if (body.backerWallet && body.backerWallet === creatorWallet) {
    backerSources.add(creatorWallet);
  }
  let sharedFundingSource = false;
  for (const source of backerSources) {
    if (creatorSources.has(source)) {
      sharedFundingSource = true;
      break;
    }
  }

  let freshWalletForSinglePledge = false;
  if (body.walletCreatedAt) {
    const created = new Date(body.walletCreatedAt).getTime();
    if (!Number.isNaN(created)) {
      const ageMs = now.getTime() - created;
      // Wallet created within the last 24h and used for this pledge only.
      freshWalletForSinglePledge = ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000;
    }
  }

  return scoreFraudSignals({
    sharedFundingSource,
    freshWalletForSinglePledge,
    identicalTimingBurst: false,
  });
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

/**
 * Dispatch external webhook events (Telegram/Discord) for pledge and milestone events.
 * Best-effort: failures must never fail the contribution.
 */
async function dispatchExternalWebhooks(
  campaign: { id: string; name?: string; raisedAmount: string; goalAmount: string; sponsorCount: number },
  milestones: number[],
  pledge: { amount: string; pledgeId: string; txHash?: string },
): Promise<void> {
  try {
    // Calculate percent funded
    const raised = BigInt(campaign.raisedAmount || "0");
    const goal = BigInt(campaign.goalAmount || "1");
    const percentFunded = goal > 0n ? Number((raised * 100n) / goal) : 0;

    // Dispatch pledge event
    await externalWebhookService.dispatchPledge({
      campaignId: campaign.id,
      campaignName: campaign.name || "Untitled Campaign",
      pledgeAmount: pledge.amount,
      totalRaised: campaign.raisedAmount,
      goalAmount: campaign.goalAmount,
      sponsorCount: campaign.sponsorCount,
      percentFunded,
      txHash: pledge.txHash,
    });

    // Dispatch milestone events
    for (const percentage of milestones) {
      await externalWebhookService.dispatchMilestone({
        campaignId: campaign.id,
        campaignName: campaign.name || "Untitled Campaign",
        percentage,
        totalRaised: campaign.raisedAmount,
        goalAmount: campaign.goalAmount,
        sponsorCount: campaign.sponsorCount,
      });
    }
  } catch (error) {
    console.error(`[External webhook] Failed to dispatch events for ${campaign.id}:`, error);
  }
}

export const POST = withCampaignApiRateLimit(postContribution);
