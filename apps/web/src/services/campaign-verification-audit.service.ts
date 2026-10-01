import { createHash } from "node:crypto";
import {
  VERIFICATION_EVENT_TYPES,
  type AppendVerificationEventInput,
  type VerificationAuditEntry,
  type VerificationEventType,
} from "@/types/campaign-verification";
import {
  getCampaign,
  getCampaignDataSource,
  type CampaignDataSource,
} from "./campaign.service";
import {
  appendVerificationEvent,
  getVerificationAuditTrail,
  verifyVerificationAuditTrail,
} from "./campaign-verification.service";

export interface AuditTrailSummary {
  campaignId: string;
  totalActivities: number;
  isImmutableAndValid: boolean;
  latestEntryHash: string | null;
  blockchainAnchorStatus: "anchored" | "pending";
  activityCounts: Record<VerificationEventType, number>;
  entries: VerificationAuditEntry[];
}

export interface VerificationActivityFilter {
  eventType?: VerificationEventType;
  actorId?: string;
  since?: number;
}

export class CampaignVerificationAuditService {
  constructor(private dataSource: CampaignDataSource = getCampaignDataSource()) {}

  /**
   * Records a verification activity with immutable SHA-256 hash chaining
   * and simulated/anchor on-chain transaction identification.
   */
  async logActivity(
    campaignId: string,
    input: AppendVerificationEventInput
  ): Promise<VerificationAuditEntry> {
    return appendVerificationEvent(campaignId, input, this.dataSource);
  }

  /**
   * Retrieves full immutable audit trail with integrity status
   */
  async getAuditTrailSummary(campaignId: string): Promise<AuditTrailSummary | null> {
    const campaign = await getCampaign(campaignId, this.dataSource);
    if (!campaign) return null;

    const entries = (await getVerificationAuditTrail(campaignId, this.dataSource)) ?? [];
    const isImmutableAndValid = verifyVerificationAuditTrail(entries);
    const latestEntryHash = entries.length > 0 ? entries[entries.length - 1].entryHash : null;

    const activityCounts: Record<VerificationEventType, number> = {
      submitted_for_review: 0,
      verifier_comment: 0,
      photo_uploaded: 0,
      approved: 0,
      rejected: 0,
    };

    let allAnchored = entries.length > 0;
    for (const entry of entries) {
      if (entry.eventType in activityCounts) {
        activityCounts[entry.eventType]++;
      }
      if (!entry.blockchainTxHash || entry.blockchainTxHash.startsWith("pending:")) {
        allAnchored = false;
      }
    }

    return {
      campaignId,
      totalActivities: entries.length,
      isImmutableAndValid,
      latestEntryHash,
      blockchainAnchorStatus: allAnchored ? "anchored" : "pending",
      activityCounts,
      entries,
    };
  }

  /**
   * Filters verification activities by type, actor, or timestamp
   */
  async filterActivities(
    campaignId: string,
    filter: VerificationActivityFilter
  ): Promise<VerificationAuditEntry[]> {
    const entries = (await getVerificationAuditTrail(campaignId, this.dataSource)) ?? [];
    return entries.filter((e) => {
      if (filter.eventType && e.eventType !== filter.eventType) return false;
      if (filter.actorId && e.actorId !== filter.actorId) return false;
      if (filter.since && e.occurredAt < filter.since) return false;
      return true;
    });
  }

  /**
   * Generates a cryptographic verification certificate for external audit
   */
  async generateAuditCertificate(campaignId: string) {
    const summary = await this.getAuditTrailSummary(campaignId);
    if (!summary) throw new Error("Campaign not found");

    const certificatePayload = {
      campaignId,
      verifiedAt: Date.now(),
      auditTrailLength: summary.totalActivities,
      rootHash: summary.latestEntryHash,
      cryptographicIntegrity: summary.isImmutableAndValid,
      signature: createHash("sha256")
        .update(`${campaignId}:${summary.latestEntryHash}:${summary.isImmutableAndValid}`)
        .digest("hex"),
    };

    return certificatePayload;
  }
}

export const campaignVerificationAuditService = new CampaignVerificationAuditService();
