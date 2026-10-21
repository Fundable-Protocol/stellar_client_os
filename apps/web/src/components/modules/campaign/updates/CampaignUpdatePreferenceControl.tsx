"use client";

/**
 * Lets a backer choose how they hear about new campaign updates: an instant
 * email for every post, a daily or weekly digest, or no email at all.
 * In-app notifications stay available unless the backer turns them off.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Mail, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  CAMPAIGN_UPDATE_NOTIFICATION_MODE_LABELS,
  CAMPAIGN_UPDATE_NOTIFICATION_MODES,
  type CampaignUpdateNotificationMode,
  type CampaignUpdatePreference,
} from "@/types/campaign-update";

export interface CampaignUpdatePreferenceControlProps {
  campaignId: string;
  viewerAddress: string;
  /** Optional email address used when the backer has none stored yet. */
  email?: string;
  className?: string;
}

export function CampaignUpdatePreferenceControl({
  campaignId,
  viewerAddress,
  email,
  className,
}: CampaignUpdatePreferenceControlProps) {
  const [preference, setPreference] = useState<CampaignUpdatePreference | null>(null);
  const [mode, setMode] = useState<CampaignUpdateNotificationMode>("instant");
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/updates/preferences?backerId=${encodeURIComponent(
            viewerAddress,
          )}`,
        );
        const json = await res.json();
        if (cancelled) return;
        if (json.preference) {
          setPreference(json.preference);
          setMode(json.preference.mode);
          setInAppEnabled(json.preference.inAppEnabled !== false);
        }
      } catch {
        // Preferences are optional; a failure leaves the defaults in place.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [campaignId, viewerAddress]);

  const save = useCallback(
    async (nextMode: CampaignUpdateNotificationMode, nextInApp: boolean) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/updates/preferences`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              backerId: viewerAddress,
              email: preference?.email ?? email,
              mode: nextMode,
              inAppEnabled: nextInApp,
            }),
          },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to save preference");
        setPreference(json.preference);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save preference");
      } finally {
        setSaving(false);
      }
    },
    [campaignId, viewerAddress, preference, email],
  );

  return (
    <div
      className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <Mail className="h-3.5 w-3.5 text-purple-400" /> Update notifications
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Choose how you want to hear about new updates from this campaign.
          </p>
        </div>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {CAMPAIGN_UPDATE_NOTIFICATION_MODES.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={mode === option ? "default" : "outline"}
            onClick={() => {
              setMode(option);
              void save(option, inAppEnabled);
            }}
            disabled={saving}
            aria-pressed={mode === option}
            className={
              mode === option
                ? "bg-purple-600 text-white hover:bg-purple-500"
                : "border-zinc-700 text-zinc-300"
            }
          >
            {CAMPAIGN_UPDATE_NOTIFICATION_MODE_LABELS[option]}
          </Button>
        ))}
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
        <Switch
          checked={inAppEnabled}
          onChange={(event) => {
            const checked = event.target.checked;
            setInAppEnabled(checked);
            void save(mode, checked);
          }}
          disabled={saving}
          aria-label="Show updates in the app"
        />
        <Smartphone className="h-3.5 w-3.5 text-zinc-500" />
        Show updates in the app notification centre
      </label>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default CampaignUpdatePreferenceControl;
