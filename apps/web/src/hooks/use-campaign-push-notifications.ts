'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  CampaignMilestoneType,
  DeviceType,
  CampaignPushSubscription,
} from '@/types/campaign-notification';

export interface UseCampaignPushOptions {
  campaignId?: string;
  subscriberAddress?: string;
}

export function useCampaignPushNotifications(options: UseCampaignPushOptions = {}) {
  const { campaignId = '*', subscriberAddress } = options;

  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [enabledMilestones, setEnabledMilestones] = useState<CampaignMilestoneType[]>([
    'trees_planted',
    'verification_complete',
    'campaign_finished',
    'impact_achieved',
  ]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const fetchSubscriptionStatus = useCallback(async () => {
    if (!subscriberAddress) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/mobile/push/subscribe?address=${encodeURIComponent(subscriberAddress)}`);
      if (res.ok) {
        const data = await res.json();
        const active = (data.subscriptions as CampaignPushSubscription[] | undefined)?.find(
          (s) => s.campaignId === campaignId || s.campaignId === '*'
        );
        if (active) {
          setIsSubscribed(true);
          if (active.enabledMilestones?.length) {
            setEnabledMilestones(active.enabledMilestones);
          }
        } else {
          setIsSubscribed(false);
        }
      }
    } catch (err: unknown) {
      console.warn('Failed to fetch push subscription status:', err);
    } finally {
      setLoading(false);
    }
  }, [campaignId, subscriberAddress]);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);

  const subscribe = async () => {
    if (!subscriberAddress) {
      setError('Wallet must be connected to enable campaign push notifications');
      return false;
    }
    setError(null);
    setLoading(true);

    try {
      let perm = permission;
      if (typeof window !== 'undefined' && 'Notification' in window) {
        perm = await Notification.requestPermission();
        setPermission(perm);
      }

      if (perm !== 'granted') {
        setError('Push notification permission was denied by the user');
        setLoading(false);
        return false;
      }

      const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isAndroid = typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);
      const deviceType: DeviceType = isIOS
        ? 'mobile_ios'
        : isAndroid
        ? 'mobile_android'
        : 'mobile_web';

      const mockEndpoint = `https://fcm.googleapis.com/fcm/send/${subscriberAddress.slice(0, 12)}_${Date.now()}`;
      const mockKeys = {
        p256dh: 'BNcRdreALRFXTkOOUHK18WK25ypqU2TqhLkhBgacGQvScqHjOudSTvWcNoqdJzhOG2EcJaRUXPa5',
        auth: 'tBHItDa قKq2W3J_example',
      };

      const res = await fetch('/api/mobile/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriberAddress,
          campaignId,
          endpoint: mockEndpoint,
          keys: mockKeys,
          deviceType,
          enabledMilestones,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Subscription failed');
      }

      setIsSubscribed(true);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to subscribe to push notifications';
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (!subscriberAddress) return false;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/mobile/push/subscribe?endpoint=${encodeURIComponent(subscriberAddress)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setIsSubscribed(false);
        return true;
      }
      return false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to unsubscribe';
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const toggleMilestone = async (milestone: CampaignMilestoneType) => {
    const updated = enabledMilestones.includes(milestone)
      ? enabledMilestones.filter((m) => m !== milestone)
      : [...enabledMilestones, milestone];

    setEnabledMilestones(updated);

    if (isSubscribed && subscriberAddress) {
      try {
        await fetch('/api/mobile/push/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscriberAddress,
            campaignId,
            enabledMilestones: updated,
          }),
        });
      } catch (err) {
        console.warn('Failed to sync updated preferences:', err);
      }
    }
  };

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    error,
    enabledMilestones,
    subscribe,
    unsubscribe,
    toggleMilestone,
  };
}
