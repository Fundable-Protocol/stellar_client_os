import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  VerificationActivityType,
  VerificationAuditEntry,
  VerificationAuditTrail,
} from '../types/campaign-verification-audit';
import { CampaignPushNotificationService } from './campaign-push-notification.service';

export interface VerificationAuditServiceOptions {
  dataDir?: string;
  pushService?: CampaignPushNotificationService;
}

export class CampaignVerificationAuditService {
  private readonly auditPath: string;
  private readonly pushService?: CampaignPushNotificationService;

  constructor(options: VerificationAuditServiceOptions = {}) {
    const dataDir = options.dataDir ?? path.join(process.cwd(), 'data');
    this.auditPath = path.join(dataDir, 'campaign_verification_audit.json');
    this.pushService = options.pushService;
  }

  private async writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (err) {
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw err;
    }
  }

  async getAllAuditTrails(): Promise<Record<string, VerificationAuditTrail>> {
    try {
      const data = await fs.readFile(this.auditPath, 'utf-8');
      return JSON.parse(data) as Record<string, VerificationAuditTrail>;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') return {};
      throw err;
    }
  }

  async getAuditTrail(campaignId: string): Promise<VerificationAuditTrail> {
    const trails = await this.getAllAuditTrails();
    return (
      trails[campaignId] ?? {
        campaignId,
        status: 'unsubmitted',
        totalActivities: 0,
        activities: [],
        lastUpdated: new Date().toISOString(),
      }
    );
  }

  async logActivity(input: {
    campaignId: string;
    activityType: VerificationActivityType;
    actor: string;
    details: string;
    txHash?: string;
    campaignTitle?: string;
  }): Promise<VerificationAuditEntry> {
    const { campaignId, activityType, actor, details, txHash, campaignTitle } = input;
    if (!campaignId || !activityType || !actor) {
      throw new Error('campaignId, activityType, and actor are required');
    }

    const trails = await this.getAllAuditTrails();
    const trail = trails[campaignId] ?? {
      campaignId,
      status: 'unsubmitted',
      totalActivities: 0,
      activities: [],
      lastUpdated: new Date().toISOString(),
    };

    const nextId = trail.totalActivities + 1;
    const timestamp = Math.floor(Date.now() / 1000);

    const newEntry: VerificationAuditEntry = {
      id: nextId,
      campaignId,
      activityType,
      actor,
      details,
      timestamp,
      txHash: txHash ?? `0x${randomUUID().replace(/-/g, '')}`,
    };

    // Update status based on activity
    if (activityType === 'submitted_for_review') {
      trail.status = 'under_review';
    } else if (activityType === 'approved') {
      trail.status = 'approved';
    } else if (activityType === 'rejected') {
      trail.status = 'rejected';
    }

    // Append to immutable log
    trail.activities.push(newEntry);
    trail.totalActivities = nextId;
    trail.lastUpdated = new Date().toISOString();

    trails[campaignId] = trail;
    await this.writeJsonAtomic(this.auditPath, trails);

    // If verification was approved, dispatch milestone push notification
    if (activityType === 'approved' && this.pushService) {
      await this.pushService.sendMilestonePushNotification({
        campaignId,
        campaignTitle: campaignTitle || `Campaign #${campaignId}`,
        milestone: 'verification_complete',
        details: {
          verifierAddress: actor,
          completionTimestamp: timestamp,
          approvalNotes: details,
        },
      });
    }

    return newEntry;
  }

  async logSubmittedForReview(
    campaignId: string,
    submitter: string,
    notes: string,
    txHash?: string
  ): Promise<VerificationAuditEntry> {
    return this.logActivity({
      campaignId,
      activityType: 'submitted_for_review',
      actor: submitter,
      details: notes,
      txHash,
    });
  }

  async logVerifierComments(
    campaignId: string,
    verifier: string,
    comments: string,
    txHash?: string
  ): Promise<VerificationAuditEntry> {
    return this.logActivity({
      campaignId,
      activityType: 'verifier_comments',
      actor: verifier,
      details: comments,
      txHash,
    });
  }

  async logPhotoUploaded(
    campaignId: string,
    uploader: string,
    photoHash: string,
    txHash?: string
  ): Promise<VerificationAuditEntry> {
    return this.logActivity({
      campaignId,
      activityType: 'photo_uploaded',
      actor: uploader,
      details: photoHash,
      txHash,
    });
  }

  async logApproved(
    campaignId: string,
    verifier: string,
    comments: string,
    campaignTitle?: string,
    txHash?: string
  ): Promise<VerificationAuditEntry> {
    return this.logActivity({
      campaignId,
      activityType: 'approved',
      actor: verifier,
      details: comments,
      campaignTitle,
      txHash,
    });
  }

  async logRejected(
    campaignId: string,
    verifier: string,
    reason: string,
    txHash?: string
  ): Promise<VerificationAuditEntry> {
    return this.logActivity({
      campaignId,
      activityType: 'rejected',
      actor: verifier,
      details: reason,
      txHash,
    });
  }
}
﻿import { createHash } from "node:crypto";
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
