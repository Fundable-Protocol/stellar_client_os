import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  VerificationActivityType,
  VerificationAuditEntry,
  VerificationAuditTrail,
} from '../types/campaign-verification-audit';

export interface VerificationNotifier {
  sendMilestonePushNotification(params: {
    campaignId: string;
    campaignTitle: string;
    milestone: string;
    details: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface VerificationAuditServiceOptions {
  dataDir?: string;
  pushService?: VerificationNotifier;
}

export class CampaignVerificationAuditService {
  private readonly auditPath: string;
  private readonly pushService?: VerificationNotifier;

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
