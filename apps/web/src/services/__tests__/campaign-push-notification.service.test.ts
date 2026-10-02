import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { CampaignPushNotificationService } from '../campaign-push-notification.service';
import type { CampaignMilestoneType } from '../../types/campaign-notification';

describe('CampaignPushNotificationService', () => {
  let tmpDir: string;
  let service: CampaignPushNotificationService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'push-test-'));
    service = new CampaignPushNotificationService({ dataDir: tmpDir });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('registers a new push subscription with default milestones', async () => {
    const sub = await service.registerSubscription({
      subscriberAddress: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
      campaignId: '100',
      endpoint: 'https://push.example.com/send/sub1',
      keys: { p256dh: 'test-key-p256', auth: 'test-auth-secret' },
      deviceType: 'mobile_ios',
    });

    expect(sub.id).toMatch(/^sub_/);
    expect(sub.campaignId).toBe('100');
    expect(sub.deviceType).toBe('mobile_ios');
    expect(sub.enabledMilestones).toEqual([
      'trees_planted',
      'verification_complete',
      'campaign_finished',
      'impact_achieved',
    ]);

    const all = await service.getSubscriptions();
    expect(all).toHaveLength(1);
    expect(all[0].endpoint).toBe('https://push.example.com/send/sub1');
  });

  it('unregisters an existing subscription', async () => {
    await service.registerSubscription({
      subscriberAddress: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
      campaignId: '100',
      endpoint: 'https://push.example.com/send/sub1',
      keys: { p256dh: 'test-key-p256', auth: 'test-auth-secret' },
    });

    const removed = await service.unregisterSubscription('https://push.example.com/send/sub1');
    expect(removed).toBe(true);

    const all = await service.getSubscriptions();
    expect(all).toHaveLength(0);
  });

  it('updates milestone notification preferences', async () => {
    await service.registerSubscription({
      subscriberAddress: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
      campaignId: '100',
      endpoint: 'https://push.example.com/send/sub1',
      keys: { p256dh: 'test-key', auth: 'test-auth' },
    });

    const updated = await service.updatePreferences(
      'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
      '100',
      ['trees_planted', 'impact_achieved']
    );

    expect(updated).toHaveLength(1);
    expect(updated[0].enabledMilestones).toEqual(['trees_planted', 'impact_achieved']);
  });

  it('formats milestone content accurately for all milestone types', () => {
    const milestones: CampaignMilestoneType[] = [
      'trees_planted',
      'verification_complete',
      'campaign_finished',
      'impact_achieved',
    ];

    for (const milestone of milestones) {
      const formatted = service.formatMilestoneContent({
        campaignId: '42',
        campaignTitle: 'Amazon Reforestation',
        milestone,
        details: { treesPlanted: 500, targetTrees: 1000, impactDescription: '10 tons CO2 offset' },
      });

      expect(formatted.title).toBeTruthy();
      expect(formatted.body).toContain('Amazon Reforestation');
    }
  });

  it('dispatches milestone push notifications to matching subscribers', async () => {
    let sentCount = 0;
    const mockSender = async () => {
      sentCount++;
      return true;
    };

    const mockService = new CampaignPushNotificationService({
      dataDir: tmpDir,
      pushSender: mockSender,
    });

    // Sub 1: Subscribed to campaign 100, all milestones
    await mockService.registerSubscription({
      subscriberAddress: 'ADDR1',
      campaignId: '100',
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'k1', auth: 'a1' },
      enabledMilestones: ['trees_planted', 'verification_complete'],
    });

    // Sub 2: Subscribed to campaign 200 (different campaign)
    await mockService.registerSubscription({
      subscriberAddress: 'ADDR2',
      campaignId: '200',
      endpoint: 'https://push.example.com/sub2',
      keys: { p256dh: 'k2', auth: 'a2' },
      enabledMilestones: ['trees_planted'],
    });

    // Sub 3: Subscribed to all campaigns '*' but disabled verification_complete
    await mockService.registerSubscription({
      subscriberAddress: 'ADDR3',
      campaignId: '*',
      endpoint: 'https://push.example.com/sub3',
      keys: { p256dh: 'k3', auth: 'a3' },
      enabledMilestones: ['trees_planted'],
    });

    // Trigger verification_complete for campaign 100
    const result = await mockService.sendMilestonePushNotification({
      campaignId: '100',
      campaignTitle: 'Green Earth',
      milestone: 'verification_complete',
      details: { verifier: 'VERIFIER_ADDR' },
    });

    // Only Sub 1 matches (campaign 100 + verification_complete enabled)
    expect(result.sentCount).toBe(1);
    expect(sentCount).toBe(1);
    expect(result.delivered[0].subscriberAddress).toBe('ADDR1');
    expect(result.delivered[0].milestone).toBe('verification_complete');

    // Trigger trees_planted for campaign 100
    const result2 = await mockService.sendMilestonePushNotification({
      campaignId: '100',
      campaignTitle: 'Green Earth',
      milestone: 'trees_planted',
      details: { treesPlanted: 100 },
    });

    // Sub 1 and Sub 3 match
    expect(result2.sentCount).toBe(2);
    expect(sentCount).toBe(3);
  });
});
