"use client";

/**
 * EmailCampaignAnalyticsCard
 *
 * Displays open-rate, click-rate and top-link stats for a sent email campaign.
 */

import React from "react";
import { Mail, MousePointerClick, BarChart3, Link2 } from "lucide-react";
import type { EmailCampaignAnalytics } from "@/types/email-campaign";

interface Props {
  analytics: EmailCampaignAnalytics;
}

function Stat({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className={`rounded-lg p-2 ${color}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-600">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function EmailCampaignAnalyticsCard({ analytics }: Props) {
  return (
    <div className="space-y-5" aria-label="Email campaign analytics">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Recipients"
          value={analytics.recipientCount.toLocaleString()}
          icon={<Mail className="h-5 w-5 text-blue-600" />}
          color="bg-blue-50"
        />
        <Stat
          label="Open rate"
          value={`${analytics.openRate.toFixed(1)}%`}
          sub={`${analytics.uniqueOpens} unique opens`}
          icon={<BarChart3 className="h-5 w-5 text-green-600" />}
          color="bg-green-50"
        />
        <Stat
          label="Click rate"
          value={`${analytics.clickRate.toFixed(1)}%`}
          sub={`${analytics.uniqueClicks} unique clicks`}
          icon={<MousePointerClick className="h-5 w-5 text-purple-600" />}
          color="bg-purple-50"
        />
        <Stat
          label="Total clicks"
          value={analytics.totalClicks.toLocaleString()}
          icon={<Link2 className="h-5 w-5 text-orange-500" />}
          color="bg-orange-50"
        />
      </div>

      {analytics.topLinks.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top clicked links</h3>
          <ol className="space-y-2">
            {analytics.topLinks.map((link, i) => (
              <li key={link.url} className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-400 w-5 shrink-0 text-right">
                  {i + 1}.
                </span>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-sm text-blue-600 hover:underline truncate"
                >
                  {link.url}
                </a>
                <span className="text-xs font-semibold text-gray-600 shrink-0">
                  {link.clicks} click{link.clicks !== 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
