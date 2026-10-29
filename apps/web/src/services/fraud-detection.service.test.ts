import { beforeEach, describe, expect, it } from 'vitest';
import { FraudDetectionService } from './fraud-detection.service';

describe('FraudDetectionService - Campaign Anomaly & Fraud Detection (Issue #876)', () => {
  let service: FraudDetectionService;

  beforeEach(() => {
    service = new FraudDetectionService();
  });

  describe('Unrealistic tree count detection (UNREALISTIC_TREE_COUNT)', () => {
    it('flags campaign when reported tree count diverges significantly from batch evidence', async () => {
      const report = await service.analyzeCampaign({
        campaignId: 'camp-trees-1',
        campaignSnapshot: {
          treeCount: 50_000,
          createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
          deadline: new Date(Date.now() + 25 * 86_400_000).toISOString(),
        },
        plantingBatches: [
          {
            treeCount: 500,
            plantedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
            verifiedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
          },
        ],
      });

      const treeFlag = report.flags.find((f) => f.patternType === 'UNREALISTIC_TREE_COUNT');
      expect(treeFlag).toBeDefined();
      expect(treeFlag?.severityScore).toBe(65);
    });

    it('flags campaign when planting volume exceeds physical capacity per duration window', async () => {
      const report = await service.analyzeCampaign({
        campaignId: 'camp-trees-2',
        campaignSnapshot: {
          treeCount: 100_000,
          createdAt: new Date('2026-01-01').toISOString(),
          deadline: new Date('2026-01-05').toISOString(), // 4 days duration
        },
        plantingBatches: [
          {
            treeCount: 100_000,
            plantedAt: new Date('2026-01-03').toISOString(),
            verifiedAt: new Date('2026-01-04').toISOString(),
          },
        ],
      });

      const treeFlag = report.flags.find((f) => f.patternType === 'UNREALISTIC_TREE_COUNT');
      expect(treeFlag).toBeDefined();
    });
  });

  describe('Verification anomaly detection (VERIFICATION_ANOMALY)', () => {
    it('flags inverted timestamps where verifiedAt precedes plantedAt', async () => {
      const report = await service.analyzeCampaign({
        campaignId: 'camp-verif-1',
        plantingBatches: [
          {
            treeCount: 100,
            plantedAt: '2026-06-10T12:00:00Z',
            verifiedAt: '2026-06-08T12:00:00Z', // Verified before planting
          },
        ],
      });

      const verifFlag = report.flags.find((f) => f.patternType === 'VERIFICATION_ANOMALY');
      expect(verifFlag).toBeDefined();
    });

    it('flags duplicate evidence hashes reused across events', async () => {
      const report = await service.analyzeCampaign({
        campaignId: 'camp-verif-2',
        plantingBatches: [
          {
            treeCount: 100,
            plantedAt: '2026-06-10T12:00:00Z',
            verifiedAt: '2026-06-11T12:00:00Z',
          },
        ],
        verificationEvents: [
          {
            planterAddress: 'G_PLANTER_1',
            verifierAddress: 'G_VERIFIER_1',
            submittedAt: '2026-06-10T12:00:00Z',
            verifiedAt: '2026-06-11T12:00:00Z',
            evidenceHash: 'ipfs://duplicate_photo_evidence_hash',
          },
          {
            planterAddress: 'G_PLANTER_2',
            verifierAddress: 'G_VERIFIER_2',
            submittedAt: '2026-06-12T12:00:00Z',
            verifiedAt: '2026-06-13T12:00:00Z',
            evidenceHash: 'ipfs://duplicate_photo_evidence_hash',
          },
        ],
      });

      const verifFlag = report.flags.find((f) => f.patternType === 'VERIFICATION_ANOMALY');
      expect(verifFlag).toBeDefined();
    });

    it('flags collusive planter-verifier repeated pairs', async () => {
      const repeatedPair = {
        planterAddress: 'G_PLANTER_COLLUSIVE',
        verifierAddress: 'G_VERIFIER_COLLUSIVE',
        submittedAt: '2026-06-10T12:00:00Z',
        evidenceHash: 'hash1',
      };

      const report = await service.analyzeCampaign({
        campaignId: 'camp-verif-3',
        plantingBatches: [
          {
            treeCount: 50,
            plantedAt: '2026-06-10T12:00:00Z',
            verifiedAt: '2026-06-11T12:00:00Z',
          },
        ],
        verificationEvents: [
          { ...repeatedPair, evidenceHash: 'hash1' },
          { ...repeatedPair, evidenceHash: 'hash2' },
          { ...repeatedPair, evidenceHash: 'hash3' },
        ],
      });

      const verifFlag = report.flags.find((f) => f.patternType === 'VERIFICATION_ANOMALY');
      expect(verifFlag).toBeDefined();
    });
  });

  describe('Bot sponsor detection (BOT_SPONSOR)', () => {
    it('flags burst pledges from newly registered backer accounts', async () => {
      const now = Date.now();
      const report = await service.analyzeCampaign({
        campaignId: 'camp-bot-1',
        backers: [
          { backerAddress: 'G_BOT_1', pledgeAmount: 10, pledgedAt: new Date(now).toISOString(), accountAgeDays: 0 },
          { backerAddress: 'G_BOT_2', pledgeAmount: 10, pledgedAt: new Date(now + 2000).toISOString(), accountAgeDays: 0 },
          { backerAddress: 'G_BOT_3', pledgeAmount: 10, pledgedAt: new Date(now + 4000).toISOString(), accountAgeDays: 0 },
          { backerAddress: 'G_BOT_4', pledgeAmount: 10, pledgedAt: new Date(now + 6000).toISOString(), accountAgeDays: 0 },
          { backerAddress: 'G_BOT_5', pledgeAmount: 10, pledgedAt: new Date(now + 8000).toISOString(), accountAgeDays: 0 },
          { backerAddress: 'G_BOT_6', pledgeAmount: 10, pledgedAt: new Date(now + 10000).toISOString(), accountAgeDays: 0 },
        ],
      });

      const botFlag = report.flags.find((f) => f.patternType === 'BOT_SPONSOR');
      expect(botFlag).toBeDefined();
      expect(botFlag?.severityScore).toBe(55);
    });
  });

  describe('Location mismatch detection (LOCATION_MISMATCH)', () => {
    it('flags planting batches located far outside submitted campaign coordinates', async () => {
      const report = await service.analyzeCampaign({
        campaignId: 'camp-loc-1',
        submittedLocation: {
          latitude: -3.4653,
          longitude: -62.2159,
        },
        plantingBatches: [
          {
            treeCount: 500,
            plantedAt: '2026-06-01T00:00:00Z',
            verifiedAt: '2026-06-02T00:00:00Z',
            latitude: 48.8566,
            longitude: 2.3522,
          },
        ],
      });

      const locFlag = report.flags.find((f) => f.patternType === 'LOCATION_MISMATCH');
      expect(locFlag).toBeDefined();
      expect(locFlag?.severityScore).toBe(60);
    });

    it('passes planting batches located within geographical tolerance', async () => {
      const report = await service.analyzeCampaign({
        campaignId: 'camp-loc-2',
        submittedLocation: {
          latitude: 0.3476,
          longitude: 32.5825,
        },
        plantingBatches: [
          {
            treeCount: 500,
            plantedAt: '2026-06-01T00:00:00Z',
            verifiedAt: '2026-06-02T00:00:00Z',
            latitude: 0.3490,
            longitude: 32.5830,
          },
        ],
      });

      const locFlag = report.flags.find((f) => f.patternType === 'LOCATION_MISMATCH');
      expect(locFlag).toBeUndefined();
    });
  });

  describe('Campaign Security Status & Auto-Suspension', () => {
    it('auto-suspends campaigns with critical fraud scores', async () => {
      const report = await service.analyzeCampaign({
        campaignId: 'camp-critical-1',
        creatorAddress: 'G_CREATOR',
        transactions: [
          { txHash: 'tx1', from: 'G_CREATOR', to: 'G_BACKER', amount: 500, timestamp: Date.now() },
          { txHash: 'tx2', from: 'G_BACKER', to: 'G_CREATOR', amount: 500, timestamp: Date.now() },
        ],
        backers: [
          { backerAddress: 'G_1', ipAddress: '1.2.3.4', pledgeAmount: 10, pledgedAt: '2026-01-01T00:00:01Z' },
          { backerAddress: 'G_2', ipAddress: '1.2.3.4', pledgeAmount: 10, pledgedAt: '2026-01-01T00:00:02Z' },
          { backerAddress: 'G_3', ipAddress: '1.2.3.4', pledgeAmount: 10, pledgedAt: '2026-01-01T00:00:03Z' },
        ],
      });

      expect(report.isSuspended).toBe(true);
      expect(report.recommendation).toBe('AUTO_SUSPEND');
      const status = await service.getSecurityStatus('camp-critical-1');
      expect(status.status).toBe('SUSPENDED');
    });
  });

  describe('AI-assisted listing review on campaign publish', () => {
    it('allows clean campaign listing without suspicious flags to go live', async () => {
      const result = await service.reviewCampaignListing({
        id: 'camp-clean-1',
        title: 'Verifiable Reforestation Project',
        creatorAddress: 'G_LEGIT_CREATOR',
        description: 'Planting indigenous trees in managed community reserves with satellite proof.',
        goalAmount: '5000',
        treeCount: 500,
        durationDays: 30,
        location: 'Kenya',
      });

      expect(result.action).toBe('ALLOWED');
      expect(result.report.flags).toHaveLength(0);
      expect(result.reviewItem).toBeUndefined();
    });

    it('flags potentially fraudulent campaign for manual review queue when anomalies exist', async () => {
      const result = await service.reviewCampaignListing({
        id: 'camp-fraud-flagged-1',
        title: 'High Yield Tree Investment',
        creatorAddress: 'G_SUSPICIOUS',
        description: 'Invest now with guaranteed 100% returns and no risk on fast growing timber.',
        goalAmount: '10000',
        treeCount: 100,
        durationDays: 10,
        location: 'Global',
      });

      expect(result.action).toBe('FLAGGED_FOR_MANUAL_REVIEW');
      expect(result.report.overallRiskScore).toBeGreaterThanOrEqual(35);
      expect(result.reviewItem).toBeDefined();
      expect(result.reviewItem?.campaignId).toBe('camp-fraud-flagged-1');
      expect(result.reviewItem?.status).toBe('PENDING');

      // Check item appears in manual review queue
      const queue = await service.getManualReviewQueue({ status: 'PENDING' });
      expect(queue.some((item) => item.campaignId === 'camp-fraud-flagged-1')).toBe(true);

      const securityStatus = await service.getSecurityStatus('camp-fraud-flagged-1');
      expect(securityStatus.status).toBe('FLAGGED');
    });

    it('auto-suspends listing with critical risk patterns', async () => {
      const result = await service.reviewCampaignListing({
        id: 'camp-auto-suspend-1',
        title: 'Money Flow Campaign',
        creatorAddress: 'G_CREATOR_CIRCULAR',
        description: 'guaranteed 100% returns',
        transactions: [
          { txHash: 'tx1', from: 'G_CREATOR_CIRCULAR', to: 'G_B1', amount: 1000, timestamp: Date.now() },
          { txHash: 'tx2', from: 'G_B1', to: 'G_CREATOR_CIRCULAR', amount: 1000, timestamp: Date.now() },
        ],
        backers: [
          { backerAddress: 'G_B1', ipAddress: '10.0.0.1', pledgeAmount: 10, pledgedAt: '2026-01-01T00:00:01Z' },
          { backerAddress: 'G_B2', ipAddress: '10.0.0.1', pledgeAmount: 10, pledgedAt: '2026-01-01T00:00:02Z' },
          { backerAddress: 'G_B3', ipAddress: '10.0.0.1', pledgeAmount: 10, pledgedAt: '2026-01-01T00:00:03Z' },
        ],
      });

      expect(result.action).toBe('AUTO_SUSPENDED');
      expect(result.report.isSuspended).toBe(true);
      expect(result.reviewItem).toBeDefined();

      const queue = await service.getManualReviewQueue();
      expect(queue.some((i) => i.campaignId === 'camp-auto-suspend-1')).toBe(true);
    });
  });

  describe('Manual Review Queue & Decision Processing', () => {
    it('allows admin to approve flagged campaign, activating security status', async () => {
      await service.reviewCampaignListing({
        id: 'camp-review-approve',
        title: 'Community Mangrove Restoration',
        description: 'guaranteed 100% returns',
      });

      const queueBefore = await service.getManualReviewQueue({ status: 'PENDING' });
      expect(queueBefore.some((i) => i.campaignId === 'camp-review-approve')).toBe(true);

      const processed = await service.processManualReview('camp-review-approve', {
        decision: 'APPROVE',
        reviewedBy: 'admin@stellar.org',
        notes: 'Verified legitimate non-profit initiative; keyword was benign metaphor.',
      });

      expect(processed.status).toBe('APPROVED');
      expect(processed.reviewedBy).toBe('admin@stellar.org');

      const status = await service.getSecurityStatus('camp-review-approve');
      expect(status.status).toBe('ACTIVE');

      const queuePending = await service.getManualReviewQueue({ status: 'PENDING' });
      expect(queuePending.some((i) => i.campaignId === 'camp-review-approve')).toBe(false);
    });

    it('allows admin to reject flagged campaign, suspending it', async () => {
      await service.reviewCampaignListing({
        id: 'camp-review-reject',
        title: 'Suspect Project',
        description: 'free crypto bonus send eth to double',
      });

      const processed = await service.processManualReview('camp-review-reject', {
        decision: 'REJECT',
        reviewedBy: 'security-admin',
        notes: 'Confirmed scam campaign.',
      });

      expect(processed.status).toBe('REJECTED');

      const status = await service.getSecurityStatus('camp-review-reject');
      expect(status.status).toBe('SUSPENDED');
    });
  });

  describe('False Positive Rate Monitoring & Quarterly Model Retraining', () => {
    it('calculates false positive rate accurately based on admin reviews', async () => {
      // 1 approved (false positive) and 1 rejected (true positive)
      await service.reviewCampaignListing({
        id: 'camp-fp-1',
        title: 'False Positive Campaign',
        description: 'guaranteed 100% returns',
      });
      await service.processManualReview('camp-fp-1', {
        decision: 'APPROVE',
        reviewedBy: 'admin',
      });

      await service.reviewCampaignListing({
        id: 'camp-tp-1',
        title: 'True Positive Campaign',
        description: 'send eth to double',
      });
      await service.processManualReview('camp-tp-1', {
        decision: 'REJECT',
        reviewedBy: 'admin',
      });

      const metrics = service.getModelMetrics();
      expect(metrics.flaggedCount).toBe(2);
      expect(metrics.approvedCount).toBe(1);
      expect(metrics.rejectedCount).toBe(1);
      // FPR = 1 / 2 = 0.5
      expect(metrics.falsePositiveRate).toBe(0.5);
      expect(metrics.version).toBe('v1.0.0');
    });

    it('identifies quarterly retraining schedule (90 days) and triggers retraining log', async () => {
      expect(service.isQuarterlyRetrainingDue()).toBe(false);

      // Advance time by 91 days
      const ninetyOneDaysMs = 91 * 24 * 60 * 60 * 1000;
      const futureTime = Date.now() + ninetyOneDaysMs;
      expect(service.isQuarterlyRetrainingDue(futureTime)).toBe(true);

      const retrainingLog = await service.retrainModel({
        triggeredBy: 'QUARTERLY_SCHEDULE',
        notes: 'Q4 scheduled model retraining incorporating validated review feedback.',
        now: futureTime,
      });

      expect(retrainingLog.previousVersion).toBe('v1.0.0');
      expect(retrainingLog.newVersion).toBe('v1.1.0');
      expect(retrainingLog.triggeredBy).toBe('QUARTERLY_SCHEDULE');

      const logs = service.getRetrainingLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].newVersion).toBe('v1.1.0');

      const updatedMetrics = service.getModelMetrics();
      expect(updatedMetrics.version).toBe('v1.1.0');
      expect(service.isQuarterlyRetrainingDue(futureTime)).toBe(false);
    });
  });
});
