import { describe, it, expect, beforeEach } from 'vitest';
import {
  RecurringContributionService,
  InMemoryRecurringContributionDataSource,
} from './recurring-contributions.service';

describe('RecurringContributionService', () => {
  let dataSource: InMemoryRecurringContributionDataSource;
  let service: RecurringContributionService;

  beforeEach(() => {
    dataSource = new InMemoryRecurringContributionDataSource();
    service = new RecurringContributionService(() => dataSource);
  });

  describe('createSubscription', () => {
    it('creates an active monthly recurring subscription', async () => {
      const sub = await service.createSubscription({
        campaignId: 'camp-101',
        campaignTitle: 'Save the Amazon',
        creatorAddress: 'GCREATOR123',
        backerAddress: 'GBACKER456',
        backerName: 'Alice',
        backerEmail: 'alice@example.com',
        amount: '50',
        token: 'USDC',
      });

      expect(sub.id).toBeDefined();
      expect(sub.status).toBe('ACTIVE');
      expect(sub.frequency).toBe('MONTHLY');
      expect(sub.amount).toBe('50');
      expect(sub.token).toBe('USDC');
      expect(sub.successfulCyclesCount).toBe(1);
      expect(sub.totalChargedAmount).toBe('50');
      expect(sub.nextChargeAt).toBeGreaterThan(sub.createdAt);
    });

    it('rejects invalid or non-positive amounts', async () => {
      await expect(
        service.createSubscription({
          campaignId: 'camp-101',
          creatorAddress: 'GCREATOR123',
          backerAddress: 'GBACKER456',
          amount: '-10',
        })
      ).rejects.toThrow('positive number');
    });
  });

  describe('subscription status management', () => {
    it('allows pausing and resuming subscriptions', async () => {
      const sub = await service.createSubscription({
        campaignId: 'camp-101',
        creatorAddress: 'GCREATOR123',
        backerAddress: 'GBACKER456',
        amount: '25',
      });

      const paused = await service.pauseSubscription(sub.id);
      expect(paused.status).toBe('PAUSED');
      expect(paused.pausedAt).toBeDefined();

      const resumed = await service.resumeSubscription(sub.id);
      expect(resumed.status).toBe('ACTIVE');
      expect(resumed.nextChargeAt).toBeGreaterThan(Date.now() - 1000);
    });

    it('allows cancelling a subscription with reason', async () => {
      const sub = await service.createSubscription({
        campaignId: 'camp-101',
        creatorAddress: 'GCREATOR123',
        backerAddress: 'GBACKER456',
        amount: '25',
      });

      const cancelled = await service.cancelSubscription(sub.id, 'Budget cut');
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.cancellationReason).toBe('Budget cut');
      expect(cancelled.cancelledAt).toBeDefined();

      await expect(service.resumeSubscription(sub.id)).rejects.toThrow('Cannot resume a cancelled subscription');
    });

    it('allows updating subscription amount', async () => {
      const sub = await service.createSubscription({
        campaignId: 'camp-101',
        creatorAddress: 'GCREATOR123',
        backerAddress: 'GBACKER456',
        amount: '25',
      });

      const updated = await service.updateSubscription(sub.id, { amount: '75' });
      expect(updated.amount).toBe('75');
    });
  });

  describe('getCreatorRecurringRevenueReport', () => {
    it('aggregates MRR, ARR, active subscribers and campaign breakdown', async () => {
      // Create 2 subscriptions for campaign 1
      await service.createSubscription({
        campaignId: 'camp-1',
        campaignTitle: 'Tree Planting Project',
        creatorAddress: 'GCREATOR1',
        backerAddress: 'GBACKER1',
        amount: '30',
        token: 'USDC',
      });

      const sub2 = await service.createSubscription({
        campaignId: 'camp-1',
        campaignTitle: 'Tree Planting Project',
        creatorAddress: 'GCREATOR1',
        backerAddress: 'GBACKER2',
        amount: '50',
        token: 'USDC',
      });

      // Create 1 subscription for campaign 2
      await service.createSubscription({
        campaignId: 'camp-2',
        campaignTitle: 'Ocean Cleanup',
        creatorAddress: 'GCREATOR1',
        backerAddress: 'GBACKER3',
        amount: '20',
        token: 'USDC',
      });

      // Pause sub2
      await service.pauseSubscription(sub2.id);

      const report = await service.getCreatorRecurringRevenueReport('GCREATOR1');

      expect(report.creatorAddress).toBe('GCREATOR1');
      expect(report.activeSubscribersCount).toBe(2); // sub1 ($30) + sub3 ($20)
      expect(report.pausedSubscribersCount).toBe(1); // sub2
      expect(report.cancelledSubscribersCount).toBe(0);
      expect(report.totalMonthlyRecurringRevenue).toBe('50.00'); // 30 + 20
      expect(report.totalAnnualRecurringRevenue).toBe('600.00'); // 50 * 12
      expect(report.totalLifetimeVolume).toBe('100.00'); // 30 + 50 + 20

      expect(report.campaigns).toHaveLength(2);
      const camp1 = report.campaigns.find((c) => c.campaignId === 'camp-1')!;
      expect(camp1.activeSubscribersCount).toBe(1);
      expect(camp1.monthlyRecurringRevenue).toBe('30.00');
      expect(camp1.totalLifetimeVolume).toBe('80.00'); // 30 + 50
    });
  });
});
