"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import type { CampaignPushEventType, CampaignPushSubscription } from "@/types/campaign-notification";

const EVENTS: { id: CampaignPushEventType; label: string; description: string }[] = [
  { id: "trees_planted", label: "Tree planting milestones", description: "When a campaign reaches tree planting targets." },
  { id: "verification_complete", label: "Verification complete", description: "When campaign work is verified." },
  { id: "impact_achieved", label: "Impact achieved", description: "When a campaign reaches its impact targets." },
  { id: "campaign_update", label: "Campaign updates", description: "When a creator posts an update." },
  { id: "campaign_finished", label: "Campaign ended", description: "When a campaign is completed." },
];

export function MobilePushPreferenceSettings({ subscriberAddress }: { subscriberAddress?: string }) {
  const [enabledEvents, setEnabledEvents] = useState<CampaignPushEventType[]>([]);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingEvent, setSavingEvent] = useState<CampaignPushEventType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!subscriberAddress) {
      setHasSubscription(false);
      setEnabledEvents([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/mobile/push/subscribe?address=${encodeURIComponent(subscriberAddress)}`)
      .then(async (response) => {
        const result = await response.json() as { subscriptions?: CampaignPushSubscription[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Unable to load mobile push settings.");
        if (cancelled) return;
        const subscription = result.subscriptions?.find((item) => item.deviceType === "mobile_ios" || item.deviceType === "mobile_android");
        setHasSubscription(Boolean(subscription));
        setEnabledEvents(subscription?.enabledEvents ?? subscription?.enabledMilestones ?? []);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load mobile push settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subscriberAddress]);

  async function toggleEvent(eventType: CampaignPushEventType) {
    if (!subscriberAddress || !hasSubscription || savingEvent) return;

    const previous = enabledEvents;
    const next = previous.includes(eventType)
      ? previous.filter((event) => event !== eventType)
      : [...previous, eventType];
    setEnabledEvents(next);
    setSavingEvent(eventType);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch("/api/mobile/push/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriberAddress,
          campaignId: "*",
          enabledMilestones: next,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save mobile push settings.");
      setSaved(true);
    } catch (saveError: unknown) {
      setEnabledEvents(previous);
      setError(saveError instanceof Error ? saveError.message : "Unable to save mobile push settings.");
    } finally {
      setSavingEvent(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-primary/10 p-2 text-primary">
          <Bell className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold">Mobile campaign notifications</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose which campaign events send push notifications to your mobile device.
          </p>
        </div>
      </div>

      {!subscriberAddress && (
        <p className="text-sm text-muted-foreground">Connect your wallet to manage mobile notifications.</p>
      )}
      {subscriberAddress && !loading && !hasSubscription && (
        <p className="text-sm text-muted-foreground">
          Enable notifications in the Fundable mobile app first to configure event types.
        </p>
      )}

      {hasSubscription && EVENTS.map(({ id, label, description }) => (
        <label key={id} className="flex cursor-pointer items-start gap-3 border-t border-border/60 pt-3">
          <input
            type="checkbox"
            checked={enabledEvents.includes(id)}
            disabled={loading || savingEvent !== null}
            onChange={() => void toggleEvent(id)}
            className="mt-1 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">{label}</span>
            <span className="block text-xs text-muted-foreground">{description}</span>
          </span>
        </label>
      ))}

      {loading && <p className="text-xs text-muted-foreground">Loading mobile notification settings…</p>}
      {saved && !error && <p className="text-xs text-emerald-600">Notification preference saved.</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
