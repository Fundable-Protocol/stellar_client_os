'use client';

import React from 'react';
import { useCampaignPushNotifications } from '@/hooks/use-campaign-push-notifications';
import { Bell, Check, Loader2, TreePine, ShieldCheck, Trophy, Sparkles } from 'lucide-react';
import type { CampaignMilestoneType } from '@/types/campaign-notification';

interface CampaignPushNotificationToggleProps {
  campaignId: string;
  campaignTitle?: string;
  subscriberAddress?: string;
}

const MILESTONES_CONFIG: {
  id: CampaignMilestoneType;
  title: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'trees_planted',
    title: 'Trees Planted',
    description: 'Alert when target tree quotas and batch planting milestones are reached.',
    icon: <TreePine className="w-4 h-4 text-emerald-500" />,
  },
  {
    id: 'verification_complete',
    title: 'Verification Complete',
    description: 'Instant notification when proof photos and field reviews are approved on-chain.',
    icon: <ShieldCheck className="w-4 h-4 text-blue-500" />,
  },
  {
    id: 'campaign_finished',
    title: 'Campaign Finished',
    description: 'Notice when the sponsored campaign completes and funds are claimed.',
    icon: <Trophy className="w-4 h-4 text-amber-500" />,
  },
  {
    id: 'impact_achieved',
    title: 'Impact Achieved',
    description: 'Milestone alerts for verified carbon offsets and ecological metrics.',
    icon: <Sparkles className="w-4 h-4 text-purple-500" />,
  },
];

export function CampaignPushNotificationToggle({
  campaignId,
  campaignTitle,
  subscriberAddress,
}: CampaignPushNotificationToggleProps) {
  const {
    isSubscribed,
    loading,
    error,
    enabledMilestones,
    subscribe,
    unsubscribe,
    toggleMilestone,
  } = useCampaignPushNotifications({
    campaignId,
    subscriberAddress,
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base leading-tight">
              Campaign Push Notifications
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Receive real-time mobile push updates as {campaignTitle ? campaignTitle : 'this campaign'} reaches milestones.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={isSubscribed ? unsubscribe : subscribe}
          disabled={loading || !subscriberAddress}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
            isSubscribed
              ? 'bg-muted hover:bg-muted/80 text-foreground border border-border'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground'
          } ${loading || !subscriberAddress ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isSubscribed ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              Subscribed
            </>
          ) : (
            'Enable Alerts'
          )}
        </button>
      </div>

      {error && (
        <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      {!subscriberAddress && (
        <p className="text-xs text-muted-foreground italic">
          Connect your wallet to configure mobile milestone alerts.
        </p>
      )}

      {isSubscribed && (
        <div className="pt-2 border-t border-border/60 space-y-2.5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Milestone Notification Preferences
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MILESTONES_CONFIG.map((m) => {
              const active = enabledMilestones.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMilestone(m.id)}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg text-left border transition-all ${
                    active
                      ? 'border-primary/40 bg-primary/5 text-foreground'
                      : 'border-border/50 bg-background/50 text-muted-foreground opacity-60'
                  }`}
                >
                  <div className="mt-0.5">{m.icon}</div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold flex items-center justify-between">
                      {m.title}
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </div>
                    <div className="text-[11px] leading-tight text-muted-foreground mt-0.5">
                      {m.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
