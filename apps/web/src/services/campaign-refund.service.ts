import { backersService } from "@/services/campaign-backers.service";
import { getCampaign } from "@/services/campaign.service";
import type { BackerContribution } from "@/types/campaign-backers";

export const REFUND_REQUEST_CUTOFF_MS = 48 * 60 * 60 * 1000;
export const REFUND_PROCESSING_SLA_MS = 24 * 60 * 60 * 1000;
const MAX_REASON_LENGTH = 1000;

export type RefundRequestStatus = "PENDING" | "APPROVED" | "DECLINED";
export type RefundDecision = "APPROVE" | "DECLINE";

export interface CampaignRefundRequest {
  id: string;
  campaignId: string;
  contributionId: string;
  backerAddress: string;
  amount: string;
  token: string;
  requestReason: string;
  status: RefundRequestStatus;
  requestedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  reviewReason?: string;
  processingDueAt?: number;
}

export interface RefundRequestResult {
  ok: true;
  request: CampaignRefundRequest;
}

export type RefundServiceResult =
  | RefundRequestResult
  | { ok: false; status: number; error: string };

const sameAddress = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

class CampaignRefundService {
  private requests = new Map<string, CampaignRefundRequest>();

  getCampaignRequests(campaignId: string): CampaignRefundRequest[] {
    return [...this.requests.values()]
      .filter((request) => request.campaignId === campaignId.trim())
      .sort((a, b) => a.requestedAt - b.requestedAt);
  }

  getBackerRequests(campaignId: string, backerAddress: string): CampaignRefundRequest[] {
    return this.getCampaignRequests(campaignId).filter((request) =>
      sameAddress(request.backerAddress, backerAddress),
    );
  }

  getBackerContributions(campaignId: string, backerAddress: string): BackerContribution[] {
    return backersService
      .getContributions(campaignId)
      .filter((contribution) => sameAddress(contribution.backerAddress, backerAddress));
  }

  async requestRefund(input: {
    campaignId: string;
    contributionId: string;
    backerAddress: string;
    reason: string;
    now?: number;
  }): Promise<RefundServiceResult> {
    const campaignId = input.campaignId.trim();
    const backerAddress = input.backerAddress.trim();
    const reason = input.reason.trim();
    if (!campaignId || !input.contributionId.trim() || !backerAddress) {
      return { ok: false, status: 400, error: "Campaign, contribution, and backer are required." };
    }
    if (!reason || reason.length > MAX_REASON_LENGTH) {
      return { ok: false, status: 400, error: `Provide a reason of up to ${MAX_REASON_LENGTH} characters.` };
    }

    const campaign = await getCampaign(campaignId);
    if (!campaign) return { ok: false, status: 404, error: "Campaign not found." };
    if (campaign.status !== "ACTIVE") {
      return { ok: false, status: 409, error: "Refund requests are only available for active campaigns." };
    }

    const closeAt = campaign.durationMs === undefined
      ? undefined
      : campaign.createdAt + campaign.durationMs;
    if (closeAt === undefined || !Number.isFinite(closeAt)) {
      return { ok: false, status: 409, error: "This campaign has no scheduled closing time." };
    }
    const now = input.now ?? Date.now();
    if (now >= closeAt - REFUND_REQUEST_CUTOFF_MS) {
      return { ok: false, status: 409, error: "Refund requests must be submitted at least 48 hours before campaign close." };
    }

    const contribution = backersService
      .getContributions(campaignId)
      .find((entry) => entry.id === input.contributionId.trim());
    if (!contribution || !sameAddress(contribution.backerAddress, backerAddress)) {
      return { ok: false, status: 404, error: "Contribution not found for this backer." };
    }
    if (this.getCampaignRequests(campaignId).some((request) => request.contributionId === contribution.id)) {
      return { ok: false, status: 409, error: "A refund request already exists for this contribution." };
    }

    const request: CampaignRefundRequest = {
      id: `rf-${now}-${crypto.randomUUID()}`,
      campaignId,
      contributionId: contribution.id,
      backerAddress,
      amount: contribution.amount,
      token: contribution.token,
      requestReason: reason,
      status: "PENDING",
      requestedAt: now,
    };
    this.requests.set(request.id, request);
    return { ok: true, request };
  }

  async reviewRequest(input: {
    campaignId: string;
    requestId: string;
    reviewerAddress: string;
    decision: RefundDecision;
    reason: string;
    now?: number;
  }): Promise<RefundServiceResult> {
    const campaignId = input.campaignId.trim();
    const reviewerAddress = input.reviewerAddress.trim();
    const reason = input.reason.trim();
    if (!reviewerAddress) return { ok: false, status: 400, error: "Reviewer wallet is required." };
    if (!reason || reason.length > MAX_REASON_LENGTH) {
      return { ok: false, status: 400, error: `Provide a review reason of up to ${MAX_REASON_LENGTH} characters.` };
    }
    if (input.decision !== "APPROVE" && input.decision !== "DECLINE") {
      return { ok: false, status: 400, error: "Decision must be APPROVE or DECLINE." };
    }

    const campaign = await getCampaign(campaignId);
    if (!campaign) return { ok: false, status: 404, error: "Campaign not found." };
    const adminAddress = process.env.REFUND_PLATFORM_ADMIN_ADDRESS?.trim();
    if (
      !sameAddress(campaign.creator, reviewerAddress) &&
      (!adminAddress || !sameAddress(adminAddress, reviewerAddress))
    ) {
      return { ok: false, status: 403, error: "Only the campaign creator or platform admin may review refunds." };
    }

    const existing = this.requests.get(input.requestId.trim());
    if (!existing || existing.campaignId !== campaignId) {
      return { ok: false, status: 404, error: "Refund request not found." };
    }
    if (existing.status !== "PENDING") {
      return { ok: false, status: 409, error: "This refund request has already been reviewed." };
    }

    const now = input.now ?? Date.now();
    const request: CampaignRefundRequest = {
      ...existing,
      status: input.decision === "APPROVE" ? "APPROVED" : "DECLINED",
      reviewedAt: now,
      reviewedBy: reviewerAddress,
      reviewReason: reason,
      processingDueAt: input.decision === "APPROVE" ? now + REFUND_PROCESSING_SLA_MS : undefined,
    };
    this.requests.set(request.id, request);
    return { ok: true, request };
  }

  reset(): void {
    this.requests.clear();
  }
}

export const campaignRefundService = new CampaignRefundService();
