import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { CampaignVerificationAuditService } from '../campaign-verification-audit.service';
import { CampaignPushNotificationService } from '../campaign-push-notification.service';

describe('CampaignVerificationAuditService', () => {
  let tmpDir: string;
  let auditService: CampaignVerificationAuditService;
  let pushService: CampaignPushNotificationService;
  let pushNotificationsDispatched: Array<{ sub: unknown; payload: { title: string; body: string; data?: Record<string, unknown> } }> = [];

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-test-'));
    pushNotificationsDispatched = [];

    pushService = new CampaignPushNotificationService({
      dataDir: tmpDir,
      pushSender: async (sub, payload) => {
        pushNotificationsDispatched.push({ sub, payload });
        return true;
      },
    });

    auditService = new CampaignVerificationAuditService({
      dataDir: tmpDir,
      pushService,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('records submitted for review and transitions status to under_review', async () => {
    const entry = await auditService.logSubmittedForReview(
      'campaign-1',
      'G_CREATOR',
      'Phase 1 planting complete, requesting field audit'
    );

    expect(entry.id).toBe(1);
    expect(entry.campaignId).toBe('campaign-1');
    expect(entry.activityType).toBe('submitted_for_review');
    expect(entry.actor).toBe('G_CREATOR');
    expect(entry.details).toBe('Phase 1 planting complete, requesting field audit');
    expect(entry.timestamp).toBeGreaterThan(0);

    const trail = await auditService.getAuditTrail('campaign-1');
    expect(trail.status).toBe('under_review');
    expect(trail.totalActivities).toBe(1);
    expect(trail.activities).toHaveLength(1);
  });

  it('logs verifier comments and photo upload in sequence', async () => {
    await auditService.logSubmittedForReview('campaign-2', 'G_CREATOR', 'Initial submission');

    const comment = await auditService.logVerifierComments(
      'campaign-2',
      'G_VERIFIER',
      'Satellite scan confirms canopy density. Please provide ground photo.'
    );
    expect(comment.id).toBe(2);
    expect(comment.activityType).toBe('verifier_comments');

    const photo = await auditService.logPhotoUploaded(
      'campaign-2',
      'G_CREATOR',
      'phash:e9a8b7c6d5e4f3a2'
    );
    expect(photo.id).toBe(3);
    expect(photo.activityType).toBe('photo_uploaded');

    const trail = await auditService.getAuditTrail('campaign-2');
    expect(trail.totalActivities).toBe(3);
    expect(trail.activities[0].activityType).toBe('submitted_for_review');
    expect(trail.activities[1].activityType).toBe('verifier_comments');
    expect(trail.activities[2].activityType).toBe('photo_uploaded');
  });

  it('logs approval, updates status to approved, and triggers verification_complete push notification', async () => {
    // Register sponsor for push notifications on campaign-3
    await pushService.registerSubscription({
      subscriberAddress: 'G_SPONSOR',
      campaignId: 'campaign-3',
      endpoint: 'https://push.example.com/sponsor',
      keys: { p256dh: 'k', auth: 'a' },
      enabledMilestones: ['verification_complete'],
    });

    await auditService.logSubmittedForReview('campaign-3', 'G_CREATOR', 'Submission');

    const approved = await auditService.logApproved(
      'campaign-3',
      'G_VERIFIER',
      'All 500 seedlings physically verified and GPS coords validated.',
      'Kilimanjaro Reforestation'
    );

    expect(approved.id).toBe(2);
    expect(approved.activityType).toBe('approved');

    const trail = await auditService.getAuditTrail('campaign-3');
    expect(trail.status).toBe('approved');

    // Confirm verification_complete push notification was dispatched
    expect(pushNotificationsDispatched).toHaveLength(1);
    expect(pushNotificationsDispatched[0].payload.title).toContain('Verification Complete');
    expect(pushNotificationsDispatched[0].payload.body).toContain('Kilimanjaro Reforestation');
  });

  it('logs rejection and updates status to rejected', async () => {
    await auditService.logSubmittedForReview('campaign-4', 'G_CREATOR', 'Submission');

    const rejected = await auditService.logRejected(
      'campaign-4',
      'G_VERIFIER',
      'Submitted photos failed perceptual hash uniqueness check (stock image match).'
    );

    expect(rejected.id).toBe(2);
    expect(rejected.activityType).toBe('rejected');

    const trail = await auditService.getAuditTrail('campaign-4');
    expect(trail.status).toBe('rejected');
  });
});
