"use client";

import React, { useState, useEffect } from "react";
import {
  type BackerCampaignNotificationPreference,
  type CampaignNotificationEvent,
  type NotificationChannel,
  type EventChannelPreferences,
  type BackedCampaignSummary,
  CAMPAIGN_NOTIFICATION_EVENTS,
  NOTIFICATION_CHANNELS,
  DEFAULT_EVENT_PREFERENCES,
} from "@/types/backer-notification-preferences";

export interface BackerNotificationPreferencePanelProps {
  backerAddress?: string;
  initialCampaigns?: BackedCampaignSummary[];
}

const EVENT_LABELS: Record<CampaignNotificationEvent, { label: string; desc: string }> = {
  updates: {
    label: "Campaign Updates",
    desc: "Creator progress logs, behind-the-scenes, and announcements",
  },
  milestones: {
    label: "Milestones",
    desc: "Funding thresholds, tree planting markers, and impact goals reached",
  },
  end_of_campaign: {
    label: "End of Campaign",
    desc: "Campaign completion, funding conclusion, or deadline reached",
  },
  reward_shipped: {
    label: "Reward Shipped",
    desc: "Physical shipping tracking or digital reward/NFT airdrop dispatch",
  },
};

const CHANNEL_LABELS: Record<NotificationChannel, { label: string; icon: string }> = {
  email: { label: "Email", icon: "✉️" },
  in_app: { label: "In-App", icon: "📱" },
  push: { label: "Push", icon: "🔔" },
};

export const BackerNotificationPreferencePanel: React.FC<BackerNotificationPreferencePanelProps> = ({
  backerAddress = "G_DEMO_BACKER_ADDRESS",
  initialCampaigns = [
    { campaignId: "camp-101", campaignTitle: "Amazon Biodiversity Reforestation", status: "Active" },
    { campaignId: "camp-102", campaignTitle: "Mangrove Estuary Coastal Defense", status: "Active" },
    { campaignId: "camp-103", campaignTitle: "Urban Solar Microgrid Initiative", status: "Completed" },
  ],
}) => {
  const [campaigns, setCampaigns] = useState<BackedCampaignSummary[]>(initialCampaigns);
  const [preferencesMap, setPreferencesMap] = useState<Record<string, EventChannelPreferences>>({});
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(initialCampaigns[0]?.campaignId || "");
  const [email, setEmail] = useState("backer@fundable.org");
  const [pushEndpoint, setPushEndpoint] = useState("https://fcm.googleapis.com/v1/projects/fundable");
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Bulk management state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkEvent, setBulkEvent] = useState<CampaignNotificationEvent | "all">("all");
  const [bulkChannel, setBulkChannel] = useState<NotificationChannel | "all">("all");
  const [bulkAction, setBulkAction] = useState<"enable" | "disable">("enable");

  // Load existing preferences on mount or backer change
  useEffect(() => {
    let isMounted = true;
    async function loadPreferences() {
      try {
        const res = await fetch(`/api/backer/notifications?backerAddress=${encodeURIComponent(backerAddress)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.preferences && Array.isArray(data.preferences)) {
            const map: Record<string, EventChannelPreferences> = {};
            data.preferences.forEach((p: BackerCampaignNotificationPreference) => {
              map[p.campaignId] = p.preferences;
            });
            setPreferencesMap((prev) => ({ ...prev, ...map }));
          }
        }
      } catch (err) {
        // Fallback / mock environment
      }
    }
    loadPreferences();
    return () => {
      isMounted = false;
    };
  }, [backerAddress]);

  // Ensure selected campaign has defined preferences
  const currentPreferences: EventChannelPreferences =
    preferencesMap[selectedCampaignId] || {
      updates: { ...DEFAULT_EVENT_PREFERENCES.updates },
      milestones: { ...DEFAULT_EVENT_PREFERENCES.milestones },
      end_of_campaign: { ...DEFAULT_EVENT_PREFERENCES.end_of_campaign },
      reward_shipped: { ...DEFAULT_EVENT_PREFERENCES.reward_shipped },
    };

  const handleToggle = (event: CampaignNotificationEvent, channel: NotificationChannel) => {
    const updatedForCampaign: EventChannelPreferences = {
      ...currentPreferences,
      [event]: {
        ...currentPreferences[event],
        [channel]: !currentPreferences[event][channel],
      },
    };

    setPreferencesMap((prev) => ({
      ...prev,
      [selectedCampaignId]: updatedForCampaign,
    }));
  };

  const handleSaveCampaignPreferences = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const activeCampaign = campaigns.find((c) => c.campaignId === selectedCampaignId);
      const res = await fetch("/api/backer/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backerAddress,
          campaignId: selectedCampaignId,
          campaignTitle: activeCampaign?.campaignTitle,
          preferences: currentPreferences,
          email,
          pushEndpoint,
        }),
      });

      if (!res.ok) throw new Error("Failed to save preferences.");

      setStatusMessage({ type: "success", text: "Preferences saved successfully!" });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "An error occurred while saving." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyBulk = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const targetEvents: CampaignNotificationEvent[] =
        bulkEvent === "all" ? [...CAMPAIGN_NOTIFICATION_EVENTS] : [bulkEvent];
      const targetChannels: NotificationChannel[] =
        bulkChannel === "all" ? [...NOTIFICATION_CHANNELS] : [bulkChannel];
      const newValue = bulkAction === "enable";

      const updatedBulkPatch: any = {};
      targetEvents.forEach((ev) => {
        updatedBulkPatch[ev] = {};
        targetChannels.forEach((ch) => {
          updatedBulkPatch[ev][ch] = newValue;
        });
      });

      const res = await fetch("/api/backer/notifications/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backerAddress,
          preferences: updatedBulkPatch,
          backedCampaigns: campaigns,
          email,
          pushEndpoint,
        }),
      });

      if (!res.ok) throw new Error("Failed to apply bulk preferences.");

      const result = await res.json();

      // Update local state for all campaigns
      const newMap = { ...preferencesMap };
      campaigns.forEach((c) => {
        const base = newMap[c.campaignId]
          ? { ...newMap[c.campaignId] }
          : {
              updates: { ...DEFAULT_EVENT_PREFERENCES.updates },
              milestones: { ...DEFAULT_EVENT_PREFERENCES.milestones },
              end_of_campaign: { ...DEFAULT_EVENT_PREFERENCES.end_of_campaign },
              reward_shipped: { ...DEFAULT_EVENT_PREFERENCES.reward_shipped },
            };

        targetEvents.forEach((ev) => {
          targetChannels.forEach((ch) => {
            base[ev][ch] = newValue;
          });
        });
        newMap[c.campaignId] = base;
      });

      setPreferencesMap(newMap);
      setIsBulkModalOpen(false);
      setStatusMessage({
        type: "success",
        text: `Bulk preferences applied to all ${campaigns.length} campaigns!`,
      });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Bulk update failed." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-label="Backer Notification Preferences"
      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8 space-y-6 text-white"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-lg">⚙️</span>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Backer Notification Preferences
            </h2>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Configure per-campaign event triggers across Email, In-App, and Push notifications.
          </p>
        </div>

        {/* Bulk Action Trigger Button */}
        <button
          type="button"
          onClick={() => setIsBulkModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-200 transition flex items-center justify-center gap-2 shadow-sm"
        >
          <span>⚡</span>
          <span>Bulk Manage All ({campaigns.length})</span>
        </button>
      </div>

      {/* Campaign Selector Pills */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Select Backed Campaign
        </label>
        <div className="flex flex-wrap gap-2">
          {campaigns.map((camp) => (
            <button
              key={camp.campaignId}
              type="button"
              onClick={() => setSelectedCampaignId(camp.campaignId)}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition text-left flex items-center gap-2 ${
                selectedCampaignId === camp.campaignId
                  ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/10"
                  : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="truncate max-w-[200px]">{camp.campaignTitle}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Notification Event Toggles */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
            Event Triggers & Notification Channels
          </h3>
          <span className="text-xs text-zinc-500">Changes apply to selected campaign</span>
        </div>

        <div className="border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800 bg-zinc-950/40">
          {CAMPAIGN_NOTIFICATION_EVENTS.map((eventKey) => {
            const eventInfo = EVENT_LABELS[eventKey];
            const channelPrefs = currentPreferences[eventKey];

            return (
              <div
                key={eventKey}
                className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-zinc-800/20 transition"
              >
                <div className="space-y-1 max-w-md">
                  <div className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
                    <span>{eventInfo.label}</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{eventInfo.desc}</p>
                </div>

                {/* Toggles for Email, In-App, Push */}
                <div className="flex items-center gap-3 self-end md:self-center">
                  {NOTIFICATION_CHANNELS.map((channelKey) => {
                    const isEnabled = channelPrefs[channelKey];
                    const chInfo = CHANNEL_LABELS[channelKey];

                    return (
                      <button
                        key={channelKey}
                        type="button"
                        onClick={() => handleToggle(eventKey, channelKey)}
                        aria-pressed={isEnabled}
                        aria-label={`Toggle ${chInfo.label} for ${eventInfo.label}`}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
                          isEnabled
                            ? "bg-emerald-500/20 border-emerald-500/80 text-emerald-300"
                            : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                        }`}
                      >
                        <span>{chInfo.icon}</span>
                        <span>{chInfo.label}</span>
                        <span
                          className={`ml-1 w-2 h-2 rounded-full ${
                            isEnabled ? "bg-emerald-400" : "bg-zinc-600"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contact & Endpoint Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div className="space-y-1.5">
          <label htmlFor="backer-pref-email" className="text-xs font-medium text-zinc-300">
            Email Recipient Address
          </label>
          <input
            id="backer-pref-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="backer@fundable.org"
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="backer-pref-push" className="text-xs font-medium text-zinc-300">
            Push Notification Endpoint / FCM Token
          </label>
          <input
            id="backer-pref-push"
            type="text"
            value={pushEndpoint}
            onChange={(e) => setPushEndpoint(e.target.value)}
            placeholder="https://fcm.googleapis.com/..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
          />
        </div>
      </div>

      {/* Feedback status message */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl border text-xs font-medium transition ${
            statusMessage.type === "success"
              ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
              : "bg-rose-950/40 border-rose-800 text-rose-300"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Footer / Save Action */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={handleSaveCampaignPreferences}
          disabled={isSaving}
          className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition flex items-center gap-2"
        >
          {isSaving ? "Saving..." : "Save Preferences"}
        </button>
      </div>

      {/* Bulk Management Modal */}
      {isBulkModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-manage-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-white">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <h3 id="bulk-manage-title" className="text-base font-bold text-white">
                  Bulk Notification Management
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Apply rules across all {campaigns.length} backed campaigns simultaneously
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 text-sm"
                aria-label="Close bulk management modal"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Event Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Select Event</label>
                <select
                  value={bulkEvent}
                  onChange={(e) => setBulkEvent(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">All Campaign Events</option>
                  <option value="updates">Updates Only</option>
                  <option value="milestones">Milestones Only</option>
                  <option value="end_of_campaign">End of Campaign Only</option>
                  <option value="reward_shipped">Reward Shipped Only</option>
                </select>
              </div>

              {/* Channel Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Select Channel</label>
                <select
                  value={bulkChannel}
                  onChange={(e) => setBulkChannel(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">All Channels (Email, In-App, Push)</option>
                  <option value="email">Email Only</option>
                  <option value="in_app">In-App Only</option>
                  <option value="push">Push Only</option>
                </select>
              </div>

              {/* Action (Enable / Disable) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Action</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setBulkAction("enable")}
                    className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition text-center ${
                      bulkAction === "enable"
                        ? "border-emerald-500 bg-emerald-950/50 text-emerald-300"
                        : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    Enable All
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkAction("disable")}
                    className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition text-center ${
                      bulkAction === "disable"
                        ? "border-rose-500 bg-rose-950/50 text-rose-300"
                        : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    Disable All
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyBulk}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition"
              >
                {isSaving ? "Applying..." : "Apply to All Campaigns"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
