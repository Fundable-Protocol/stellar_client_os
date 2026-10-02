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
});
