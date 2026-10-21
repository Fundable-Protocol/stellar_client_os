"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@/providers/StellarWalletProvider";
import { InAppSurveyNotification } from "@/types/campaign-survey";
import { MessageSquare, Bell, Check, ExternalLink } from "lucide-react";
import Link from "next/link";

export interface InAppSurveyNotificationBannerProps {
  campaignId: string;
}

export function InAppSurveyNotificationBanner({
  campaignId,
}: InAppSurveyNotificationBannerProps) {
  const { address } = useWallet();
  const [notifications, setNotifications] = useState<InAppSurveyNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!address) {
      setNotifications([]);
      return;
    }

    async function loadNotifications() {
      try {
        const res = await fetch(
          `/api/campaigns/${campaignId}/surveys/notifications?backer=${address}`
        );
        const data = await res.json();
        if (data.success && Array.isArray(data.notifications)) {
          setNotifications(data.notifications.filter((n) => !n.read));
        }
      } catch (err) {
        console.error("Error loading survey notifications:", err);
      }
    }

    loadNotifications();
  }, [campaignId, address]);

  const handleDismiss = async (notificationId: string) => {
    setDismissedIds((prev) => new Set(prev).add(notificationId));
    if (!address) return;
    try {
      await fetch(`/api/campaigns/${campaignId}/surveys/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationId,
          backerAddress: address,
        }),
      });
    } catch (err) {
      console.error("Error dismissing notification:", err);
    }
  };

  const activeNotifs = notifications.filter((n) => !dismissedIds.has(n.id));
  if (activeNotifs.length === 0) return null;

  return (
    <div className="space-y-2 mb-4" data-testid="in-app-survey-notifications">
      {activeNotifs.map((notif) => (
        <div
          key={notif.id}
          className="p-4 rounded-xl border border-purple-500/30 bg-purple-950/30 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-300">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-white">{notif.title}</h4>
              <p className="text-xs text-zinc-300">{notif.message}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/campaigns/${campaignId}/surveys/${notif.surveyId}`}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium inline-flex items-center gap-1 transition"
            >
              Take Survey <ExternalLink className="w-3 h-3" />
            </Link>
            <button
              type="button"
              onClick={() => handleDismiss(notif.id)}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"
              title="Dismiss notification"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default InAppSurveyNotificationBanner;
