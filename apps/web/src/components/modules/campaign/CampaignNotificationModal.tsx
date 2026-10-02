"use client";

import React, { useState, useEffect } from "react";

export type NotificationFrequency = "daily" | "weekly" | "monthly" | "milestones";
export type NotificationChannel = "email" | "push";

export interface CampaignNotificationModalProps {
  campaignId: string;
  campaignName: string;
  sponsorId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (prefs: {
    frequency: NotificationFrequency;
    channel: NotificationChannel;
    email?: string;
    pushEndpoint?: string;
  }) => void;
}

/**
 * CampaignNotificationModal Component (Issue #882)
 *
 * Allows sponsors to configure their campaign progress notification frequency:
 * daily, weekly, monthly, or only on milestones.
 * Supports email or push notification channels.
 */
export const CampaignNotificationModal: React.FC<CampaignNotificationModalProps> = ({
  campaignId,
  campaignName,
  sponsorId,
  isOpen,
  onClose,
  onSave,
}) => {
  const [frequency, setFrequency] = useState<NotificationFrequency>("milestones");
  const [channel, setChannel] = useState<NotificationChannel>("email");
  const [email, setEmail] = useState("");
  const [pushEndpoint, setPushEndpoint] = useState("https://fcm.googleapis.com/fcm/send/default-client");
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !sponsorId || !campaignId) return;

    let isMounted = true;
    const fetchPrefs = async () => {
      try {
        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/notifications?sponsorId=${encodeURIComponent(sponsorId)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data) {
            if (data.frequency) setFrequency(data.frequency);
            if (data.channel) setChannel(data.channel);
            if (data.email) setEmail(data.email);
            if (data.pushEndpoint) setPushEndpoint(data.pushEndpoint);
          }
        }
      } catch (err) {
        console.error("Failed to load notification preferences:", err);
      }
    };

    fetchPrefs();
    return () => {
      isMounted = false;
    };
  }, [isOpen, campaignId, sponsorId]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (channel === "email" && (!email || !email.includes("@"))) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    if (channel === "push" && !pushEndpoint) {
      setErrorMessage("Push notification endpoint is required.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        sponsorId,
        frequency,
        channel,
        email: channel === "email" ? email : undefined,
        pushEndpoint: channel === "push" ? pushEndpoint : undefined,
      };

      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update notification preferences");
      }

      setSuccessMessage("Preferences saved successfully!");
      if (onSave) onSave(payload);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="notification-modal-title" className="text-lg font-bold text-white">
              Campaign Progress Notifications
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{campaignName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1"
            aria-label="Close notification settings"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Notification Frequency */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Notification Frequency
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { id: "milestones", label: "Milestones Only", desc: "Tree targets reached" },
                { id: "daily", label: "Daily Digest", desc: "Every 24 hours" },
                { id: "weekly", label: "Weekly Summary", desc: "Every 7 days" },
                { id: "monthly", label: "Monthly Report", desc: "Every 30 days" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFrequency(item.id as NotificationFrequency)}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    frequency === item.id
                      ? "border-emerald-500 bg-emerald-950/40 text-emerald-200"
                      : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <span className="font-bold">{item.label}</span>
                  <span className="text-[10px] text-slate-400 mt-1">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Delivery Channel */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Delivery Channel
            </label>
            <div className="flex gap-3">
              {[
                { id: "email", label: "✉️ Email Notification" },
                { id: "push", label: "🔔 Push Notification" },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannel(c.id as NotificationChannel)}
                  className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition text-center ${
                    channel === c.id
                      ? "border-emerald-500 bg-emerald-950/50 text-emerald-300"
                      : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Channel Input Field */}
          {channel === "email" ? (
            <div className="space-y-1.5">
              <label htmlFor="pref-email" className="text-xs font-semibold text-slate-300">
                Email Address
              </label>
              <input
                id="pref-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sponsor@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="pref-push" className="text-xs font-semibold text-slate-300">
                Push Client Endpoint
              </label>
              <input
                id="pref-push"
                type="text"
                value={pushEndpoint}
                onChange={(e) => setPushEndpoint(e.target.value)}
                placeholder="https://fcm.googleapis.com/fcm/send/..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition font-mono"
              />
            </div>
          )}

          {/* Feedback Alerts */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs">
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800/80 text-emerald-300 text-xs">
              {successMessage}
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition"
            >
              {isSaving ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
