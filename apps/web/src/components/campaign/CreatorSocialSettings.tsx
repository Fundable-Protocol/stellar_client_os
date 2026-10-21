"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Globe, Hash, Linkedin, Link2, Link2Off, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LinkedInBadge } from "@/components/creator/LinkedInBadge";
import type { LinkedInConnection } from "@/services/linkedin.service";
import {
  ALL_SCHEDULABLE_PLATFORMS,
  SCHEDULABLE_PLATFORMS,
  connectSocialAccount,
  disconnectSocialAccount,
  getCreatorSocialSettings,
  updateCreatorSocialSettings,
  type CreatorSocialSettings as CreatorSocialSettingsRecord,
  type SchedulablePlatform,
} from "@/services/campaign-social-scheduler.service";

export interface CreatorSocialSettingsProps {
  creatorAddress?: string;
  settings?: CreatorSocialSettingsRecord;
  onSettingsChange?: (next: CreatorSocialSettingsRecord) => void;
}

const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Asia/Singapore",
  "Asia/Tokyo",
];

export const CreatorSocialSettings: React.FC<CreatorSocialSettingsProps> = ({
  creatorAddress = "GD6W...X892",
  settings: controlledSettings,
  onSettingsChange,
}) => {
  const [internalSettings, setInternalSettings] = useState<CreatorSocialSettingsRecord>(() =>
    getCreatorSocialSettings(creatorAddress),
  );
  const settings = controlledSettings ?? internalSettings;

  const [handles, setHandles] = useState<Record<SchedulablePlatform, string>>(() => ({
    twitter: settings.accounts.twitter.handle,
    facebook: settings.accounts.facebook.handle,
    linkedin: settings.accounts.linkedin.handle,
  }));

  const [displayNames, setDisplayNames] = useState<Record<SchedulablePlatform, string>>(() => ({
    twitter: settings.accounts.twitter.displayName,
    facebook: settings.accounts.facebook.displayName,
    linkedin: settings.accounts.linkedin.displayName,
  }));

  const [hashtagsInput, setHashtagsInput] = useState<string>(() =>
    settings.defaultHashtags.join(", "),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── LinkedIn Profile Badge state ──────────────────────────────────────────
  type PublicLinkedInData = Omit<LinkedInConnection, "accessToken">;
  const [linkedInData, setLinkedInData] = useState<PublicLinkedInData | null>(null);
  const [linkedInLoading, setLinkedInLoading] = useState(true);
  const [linkedInConnecting, setLinkedInConnecting] = useState(false);
  const [linkedInDisconnecting, setLinkedInDisconnecting] = useState(false);

  /** Fetch the current LinkedIn connection status on mount */
  const fetchLinkedInStatus = useCallback(async () => {
    if (!creatorAddress) return;
    try {
      const res = await fetch(
        `/api/creators/${encodeURIComponent(creatorAddress)}/linkedin`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { connected: boolean; data: PublicLinkedInData | null };
      setLinkedInData(json.connected ? json.data : null);
    } catch {
      // Non-critical — silently degrade
    } finally {
      setLinkedInLoading(false);
    }
  }, [creatorAddress]);

  useEffect(() => {
    fetchLinkedInStatus();
    // Re-check if the page gained focus after an OAuth redirect
    const handleFocus = () => void fetchLinkedInStatus();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchLinkedInStatus]);

  const handleLinkedInConnect = async () => {
    setLinkedInConnecting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(
        `/api/creators/${encodeURIComponent(creatorAddress)}/linkedin`,
        { method: "POST" },
      );
      const json = (await res.json()) as { authorizationUrl?: string; error?: string };
      if (!res.ok || !json.authorizationUrl) {
        throw new Error(json.error ?? "Failed to start LinkedIn connection");
      }
      // Open the OAuth flow in the same tab so the callback can redirect back
      window.location.href = json.authorizationUrl;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "LinkedIn connection failed");
      setLinkedInConnecting(false);
    }
  };

  const handleLinkedInDisconnect = async () => {
    setLinkedInDisconnecting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(
        `/api/creators/${encodeURIComponent(creatorAddress)}/linkedin`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to disconnect LinkedIn");
      }
      setLinkedInData(null);
      setStatusMessage("LinkedIn profile badge disconnected");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "LinkedIn disconnect failed");
    } finally {
      setLinkedInDisconnecting(false);
    }
  };
  // ── end LinkedIn state ────────────────────────────────────────────────────

  const applySettings = (next: CreatorSocialSettingsRecord, message?: string) => {
    setInternalSettings(next);
    onSettingsChange?.(next);
    setErrorMessage(null);
    if (message) {
      setStatusMessage(message);
    }
  };

  const handleConnect = (platform: SchedulablePlatform) => {
    const rawHandle = handles[platform]?.trim() || SCHEDULABLE_PLATFORMS[platform].handlePlaceholder;
    try {
      const next = connectSocialAccount(creatorAddress, {
        platform,
        handle: rawHandle,
        displayName: displayNames[platform]?.trim() || undefined,
      });
      setHandles((prev) => ({ ...prev, [platform]: next.accounts[platform].handle }));
      setDisplayNames((prev) => ({
        ...prev,
        [platform]: next.accounts[platform].displayName,
      }));
      applySettings(next, `Connected ${SCHEDULABLE_PLATFORMS[platform].label} (${next.accounts[platform].handle})`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not connect social account");
    }
  };

  const handleDisconnect = (platform: SchedulablePlatform) => {
    const next = disconnectSocialAccount(creatorAddress, platform);
    setHandles((prev) => ({ ...prev, [platform]: "" }));
    setDisplayNames((prev) => ({ ...prev, [platform]: "" }));
    applySettings(next, `Disconnected ${SCHEDULABLE_PLATFORMS[platform].label}`);
  };

  const handleSaveDefaults = (e: React.FormEvent) => {
    e.preventDefault();
    const next = updateCreatorSocialSettings(creatorAddress, {
      defaultHashtags: hashtagsInput,
      timezone: settings.timezone,
    });
    setHashtagsInput(next.defaultHashtags.join(", "));
    applySettings(next, "Saved default creator social settings");
  };

  const handleTimezoneChange = (timezone: string) => {
    const next = updateCreatorSocialSettings(creatorAddress, { timezone });
    applySettings(next, `Updated scheduling timezone to ${timezone}`);
  };

  const connectedCount = ALL_SCHEDULABLE_PLATFORMS.filter(
    (p) => settings.accounts[p]?.connected,
  ).length;

  return (
    <section
      data-testid="creator-social-settings"
      aria-labelledby="creator-social-settings-heading"
      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <h3
            id="creator-social-settings-heading"
            className="text-lg font-bold text-zinc-100 flex items-center gap-2"
          >
            <Settings className="h-5 w-5 text-purple-400" aria-hidden="true" />
            Creator Settings: Social Media Account Connections
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            Connect your Twitter/X, Facebook, and LinkedIn accounts to schedule automated campaign promotions directly from your dashboard.
          </p>
        </div>

        <Badge
          variant="outline"
          data-testid="connected-accounts-badge"
          className="border-purple-500/40 bg-purple-950/30 text-purple-300 text-xs self-start sm:self-auto"
        >
          {connectedCount} / 3 Accounts Connected
        </Badge>
      </div>

      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-2.5 text-xs font-medium text-emerald-300 flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-rose-700/50 bg-rose-950/30 px-4 py-2.5 text-xs font-medium text-rose-300"
        >
          {errorMessage}
        </div>
      )}

      {/* Platform Account Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ALL_SCHEDULABLE_PLATFORMS.map((platform) => {
          const meta = SCHEDULABLE_PLATFORMS[platform];
          const account = settings.accounts[platform];

          return (
            <div
              key={platform}
              data-testid={`social-account-card-${platform}`}
              className={`rounded-xl border p-4 flex flex-col justify-between gap-4 transition-colors ${
                account.connected
                  ? "border-emerald-700/50 bg-emerald-950/10"
                  : "border-zinc-800 bg-zinc-950/60"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-extrabold text-white"
                      style={{ backgroundColor: meta.accentColor }}
                    >
                      {meta.shortLabel}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-zinc-100">{meta.label}</p>
                      <p className="text-[11px] text-zinc-500">Max {meta.maxChars} chars</p>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    data-testid={`connection-status-${platform}`}
                    className={
                      account.connected
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[11px]"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400 text-[11px]"
                    }
                  >
                    {account.connected ? "Connected" : "Not Connected"}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-300">
                    Account Handle / URL
                    <input
                      type="text"
                      aria-label={`${meta.label} account handle`}
                      data-testid={`handle-input-${platform}`}
                      placeholder={meta.handlePlaceholder}
                      value={handles[platform]}
                      onChange={(e) =>
                        setHandles((prev) => ({ ...prev, [platform]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </label>

                  <label className="block text-xs font-medium text-zinc-300">
                    Display Name (optional)
                    <input
                      type="text"
                      aria-label={`${meta.label} display name`}
                      data-testid={`display-name-input-${platform}`}
                      placeholder="Campaign Official Page"
                      value={displayNames[platform]}
                      onChange={(e) =>
                        setDisplayNames((prev) => ({
                          ...prev,
                          [platform]: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/80">
                <Button
                  type="button"
                  size="sm"
                  data-testid={`connect-btn-${platform}`}
                  aria-label={
                    account.connected ? `Update ${meta.label}` : `Connect ${meta.label}`
                  }
                  onClick={() => handleConnect(platform)}
                  className={
                    account.connected
                      ? "flex-1 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 text-xs"
                      : "flex-1 bg-purple-600 text-white hover:bg-purple-700 text-xs"
                  }
                >
                  <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {account.connected ? "Update Account" : `Connect ${meta.label}`}
                </Button>

                {account.connected && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid={`disconnect-btn-${platform}`}
                    aria-label={`Disconnect ${meta.label}`}
                    onClick={() => handleDisconnect(platform)}
                    className="border-rose-700/50 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50 text-xs"
                  >
                    <Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Default Hashtags & Timezone Row */}
      <form
        onSubmit={handleSaveDefaults}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-zinc-800 items-end"
      >
        <label className="block text-xs font-medium text-zinc-300 md:col-span-2">
          <span className="flex items-center gap-1.5 mb-1">
            <Hash className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />
            Default Campaign Hashtags
          </span>
          <input
            type="text"
            aria-label="Default campaign hashtags"
            data-testid="default-hashtags-input"
            value={hashtagsInput}
            onChange={(e) => setHashtagsInput(e.target.value)}
            placeholder="#Fundable, #Stellar, #Reforestation"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </label>

        <div className="flex items-end gap-2">
          <label className="block text-xs font-medium text-zinc-300 flex-1">
            <span className="flex items-center gap-1.5 mb-1">
              <Globe className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              Timezone
            </span>
            <select
              aria-label="Creator scheduling timezone"
              data-testid="creator-timezone-select"
              value={settings.timezone}
              onChange={(e) => handleTimezoneChange(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>

          <Button
            type="submit"
            size="sm"
            variant="outline"
            data-testid="save-social-defaults-btn"
            className="border-purple-700 bg-purple-950/40 text-purple-200 hover:bg-purple-900/60 text-xs h-[34px]"
          >
            Save Defaults
          </Button>
        </div>
      </form>

      {/* ── LinkedIn Profile Badge ─────────────────────────────────────── */}
      <div
        className="pt-4 border-t border-zinc-800 space-y-4"
        data-testid="linkedin-profile-badge-section"
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h4 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Linkedin className="h-4 w-4 text-[#0077b5]" aria-hidden="true" />
              LinkedIn Profile Badge
            </h4>
            <p className="mt-0.5 text-xs text-zinc-400">
              Connect your LinkedIn account to display your professional credentials and
              endorsed skills on your campaign pages. Builds credibility with professional backers.
            </p>
          </div>

          {!linkedInLoading && (
            <Badge
              variant="outline"
              data-testid="linkedin-connection-status-badge"
              className={
                linkedInData
                  ? "border-[#0077b5]/40 bg-[#0077b5]/10 text-[#6ab4e8] text-[11px]"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 text-[11px]"
              }
            >
              {linkedInData ? "Connected" : "Not Connected"}
            </Badge>
          )}
        </div>

        {linkedInLoading ? (
          <div
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 h-28 animate-pulse"
            aria-busy="true"
            aria-label="Loading LinkedIn status"
          />
        ) : linkedInData ? (
          <div className="space-y-3">
            {/* Show the badge preview using the same component as the creator page */}
            <LinkedInBadge
              data={linkedInData}
              maxSkills={5}
              className="border-zinc-700 !bg-zinc-900"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleLinkedInDisconnect()}
              disabled={linkedInDisconnecting}
              data-testid="linkedin-disconnect-btn"
              aria-label="Disconnect LinkedIn profile badge"
              className="border-rose-700/50 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50 text-xs"
            >
              <Link2Off className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {linkedInDisconnecting ? "Disconnecting…" : "Disconnect LinkedIn"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => void handleLinkedInConnect()}
            disabled={linkedInConnecting}
            data-testid="linkedin-connect-btn"
            aria-label="Connect LinkedIn account for profile badge"
            className="bg-[#0077b5] text-white hover:bg-[#006097] text-xs"
          >
            <Linkedin className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {linkedInConnecting ? "Redirecting to LinkedIn…" : "Connect LinkedIn"}
          </Button>
        )}
      </div>
      {/* ── end LinkedIn Profile Badge ─────────────────────────────────── */}
    </section>
  );
};

export default CreatorSocialSettings;
