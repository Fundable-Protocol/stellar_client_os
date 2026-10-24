import { randomUUID } from 'crypto';

export type CampaignStatus = 'Successful' | 'Failed' | 'Claimed' | 'Active' | 'Draft' | 'Cancelled';

export type DisputeStatus = 'open' | 'creator_responded' | 'under_review' | 'resolved' | 'rejected';

export type DisputeReason = 'undelivered_reward' | 'fraudulent_campaign' | 'other';

export type RefundType = 'partial' | 'full';

export type DisputeDecision = 'refund' | 'reject';

export interface Campaign {
  id: string;
  creatorAddress: string;
  status: CampaignStatus;
  escrowTotal: number;
}

export interface Dispute {
  id: string;
  campaignId: string;
  backerAddress: string;
  reason: DisputeReason;
  description: string;
  filedAt: Date;
  creatorResponseDeadline: Date;
  creatorResponse?: string;
  creatorRespondedAt?: Date;
  status: DisputeStatus;
  mediatorId?: string;
  assignedAt?: Date;
  resolvedAt?: Date;
  decision?: DisputeDecision;
  refundType?: RefundType;
  refundAmount?: number;
  resolutionNotes?: string;
}

export interface FileDisputeInput {
  campaignId: string;
  backerAddress: string;
  reason: DisputeReason;
  description: string;
}

export interface ResolveDisputeInput {
  disputeId: string;
  mediatorId: string;
  decision: DisputeDecision;
  refundType?: RefundType;
  refundAmount?: number;
  resolutionNotes?: string;
}

const CREATOR_RESPONSE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const CLOSED_CAMPAIGN_STATUSES: CampaignStatus[] = ['Successful', 'Failed', 'Claimed'];

export class CampaignDisputeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CampaignDisputeError';
  }
}

class CampaignDisputeService {
  private disputes: Map<string, Dispute> = new Map();
  private campaigns: Map<string, Campaign> = new Map();

  /**
   * Register a campaign so disputes can be filed against it.
   * In a real implementation this would be backed by the campaign repository.
   */
  registerCampaign(campaign: Campaign): void {
    this.campaigns.set(campaign.id, campaign);
  }

  private getCampaign(campaignId: string): Campaign {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      throw new CampaignDisputeError(`Campaign ${campaignId} not found`);
    }
    return campaign;
  }

  private getDisputeOrThrow(disputeId: string): Dispute {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new CampaignDisputeError(`Dispute ${disputeId} not found`);
    }
    return dispute;
  }

  /**
   * Auto-transition an open dispute to under_review once the creator
   * response deadline has passed.
   */
  private applyDeadlineTransition(dispute: Dispute, now: Date = new Date()): Dispute {
    if (dispute.status === 'open' && now.getTime() > dispute.creatorResponseDeadline.getTime()) {
      dispute.status = 'under_review';
    }
    return dispute;
  }

  fileDispute(input: FileDisputeInput): Dispute {
    const { campaignId, backerAddress, reason, description } = input;

    if (!backerAddress || backerAddress.trim() === '') {
      throw new CampaignDisputeError('Backer address is required');
    }
    if (!description || description.trim() === '') {
      throw new CampaignDisputeError('Dispute description is required');
    }

    const campaign = this.getCampaign(campaignId);

    if (!CLOSED_CAMPAIGN_STATUSES.includes(campaign.status)) {
      throw new CampaignDisputeError(
        `Disputes can only be filed after campaign close. Campaign status is '${campaign.status}'`,
      );
    }

    const filedAt = new Date();
    const creatorResponseDeadline = new Date(filedAt.getTime() + CREATOR_RESPONSE_WINDOW_MS);

    const dispute: Dispute = {
      id: randomUUID(),
      campaignId,
      backerAddress,
      reason,
      description,
      filedAt,
      creatorResponseDeadline,
      status: 'open',
    };

    this.disputes.set(dispute.id, dispute);
    return dispute;
  }

  respondToDispute(disputeId: string, creatorAddress: string, response: string): Dispute {
    const dispute = this.getDisputeOrThrow(disputeId);
    const campaign = this.getCampaign(dispute.campaignId);

    if (campaign.creatorAddress !== creatorAddress) {
      throw new CampaignDisputeError('Only the campaign creator can respond to this dispute');
    }

    if (!response || response.trim() === '') {
      throw new CampaignDisputeError('Response is required');
    }

    const now = new Date();

    if (dispute.status !== 'open') {
      // If the deadline has passed, reflect the auto-transition before rejecting.
      this.applyDeadlineTransition(dispute, now);
      throw new CampaignDisputeError(
        `Cannot respond to dispute in status '${dispute.status}'`,
      );
    }

    if (now.getTime() > dispute.creatorResponseDeadline.getTime()) {
      dispute.status = 'under_review';
      throw new CampaignDisputeError('Creator response deadline has passed');
    }

    dispute.creatorResponse = response;
    dispute.creatorRespondedAt = now;
    dispute.status = 'creator_responded';

    return dispute;
  }

  assignMediator(disputeId: string, mediatorId: string): Dispute {
    if (!mediatorId || mediatorId.trim() === '') {
      throw new CampaignDisputeError('Mediator id is required');
    }

    const dispute = this.getDisputeOrThrow(disputeId);
    this.applyDeadlineTransition(dispute);

    if (dispute.status === 'resolved' || dispute.status === 'rejected') {
      throw new CampaignDisputeError(`Cannot assign mediator to a ${dispute.status} dispute`);
    }

    dispute.mediatorId = mediatorId;
    dispute.assignedAt = new Date();
    dispute.status = 'under_review';

    return dispute;
  }

  resolveDispute(input: ResolveDisputeInput): Dispute {
    const { disputeId, mediatorId, decision, refundType, refundAmount, resolutionNotes } = input;

    if (!mediatorId || mediatorId.trim() === '') {
      throw new CampaignDisputeError('Mediator id is required');
    }

    const dispute = this.getDisputeOrThrow(disputeId);
    this.applyDeadlineTransition(dispute);

    if (dispute.status === 'resolved' || dispute.status === 'rejected') {
      throw new CampaignDisputeError(`Dispute is already ${dispute.status}`);
    }

    if (dispute.mediatorId && dispute.mediatorId !== mediatorId) {
      throw new CampaignDisputeError('Only the assigned mediator can resolve this dispute');
    }

    const campaign = this.getCampaign(dispute.campaignId);

    if (decision === 'reject') {
      dispute.status = 'rejected';
      dispute.decision = 'reject';
      dispute.mediatorId = mediatorId;
      dispute.resolvedAt = new Date();
      if (resolutionNotes !== undefined) {
        dispute.resolutionNotes = resolutionNotes;
      }
      return dispute;
    }

    if (decision !== 'refund') {
      throw new CampaignDisputeError(`Unknown decision '${decision}'`);
    }

    if (!refundType) {
      throw new CampaignDisputeError('Refund type is required for a refund decision');
    }

    let resolvedAmount: number;

    if (refundType === 'full') {
      resolvedAmount = campaign.escrowTotal;
    } else if (refundType === 'partial') {
      if (refundAmount === undefined || refundAmount === null) {
        throw new CampaignDisputeError('Refund amount is required for a partial refund');
      }
      if (refundAmount <= 0) {
        throw new CampaignDisputeError('Refund amount must be greater than zero');
      }
      if (refundAmount > campaign.escrowTotal) {
        throw new CampaignDisputeError(
          `Refund amount ${refundAmount} exceeds escrow total ${campaign.escrowTotal}`,
        );
      }
      resolvedAmount = refundAmount;
    } else {
      throw new CampaignDisputeError(`Unknown refund type '${refundType}'`);
    }

    dispute.status = 'resolved';
    dispute.decision = 'refund';
    dispute.refundType = refundType;
    dispute.refundAmount = resolvedAmount;
    dispute.mediatorId = mediatorId;
    dispute.resolvedAt = new Date();
    if (resolutionNotes !== undefined) {
      dispute.resolutionNotes = resolutionNotes;
    }

    return dispute;
  }

  getDispute(disputeId: string): Dispute | undefined {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      return undefined;
    }
    this.applyDeadlineTransition(dispute);
    return dispute;
  }

  listDisputesForCampaign(campaignId: string): Dispute[] {
    const result: Dispute[] = [];
    for (const dispute of this.disputes.values()) {
      if (dispute.campaignId === campaignId) {
        this.applyDeadlineTransition(dispute);
        result.push(dispute);
      }
    }
    return result;
  }

  listOpenDisputes(): Dispute[] {
    const result: Dispute[] = [];
    for (const dispute of this.disputes.values()) {
      this.applyDeadlineTransition(dispute);
      if (dispute.status !== 'resolved' && dispute.status !== 'rejected') {
        result.push(dispute);
      }
    }
    return result;
  }
}

export const campaignDisputeService = new CampaignDisputeService();
export default campaignDisputeService;