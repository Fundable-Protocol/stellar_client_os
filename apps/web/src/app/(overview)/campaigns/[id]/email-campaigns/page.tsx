"use client";

/**
 * /campaigns/[id]/email-campaigns
 *
 * Campaign creator dashboard for managing email campaigns:
 *   - List existing email campaigns (drafts + sent)
 *   - Create and edit a campaign with the drag-and-drop builder
 *   - Send a draft campaign
 *   - View open / click analytics for sent campaigns
 */

import React, { use, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Mail,
  Send,
  BarChart3,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmailCampaignBuilder } from "@/components/email-campaigns/EmailCampaignBuilder";
import { EmailCampaignAnalyticsCard } from "@/components/email-campaigns/EmailCampaignAnalyticsCard";
import type { EmailCampaign, EmailCampaignAnalytics } from "@/types/email-campaign";

// ─── Types for page state ──────────────────────────────────────────────────────

type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; campaign: EmailCampaign }
  | { kind: "analytics"; campaign: EmailCampaign; analytics: EmailCampaignAnalytics };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  EmailCampaign["status"],
  { label: string; color: string; icon: React.ReactNode }
> = {
  draft: {
    label: "Draft",
    color: "bg-yellow-100 text-yellow-800",
    icon: <Clock className="h-3 w-3" />,
  },
  scheduled: {
    label: "Scheduled",
    color: "bg-blue-100 text-blue-800",
    icon: <Clock className="h-3 w-3" />,
  },
  sent: {
    label: "Sent",
    color: "bg-green-100 text-green-800",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "Failed",
    color: "bg-red-100 text-red-800",
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

function StatusBadge({ status }: { status: EmailCampaign["status"] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Campaign list row ─────────────────────────────────────────────────────────

interface CampaignRowProps {
  campaign: EmailCampaign;
  onEdit: (c: EmailCampaign) => void;
  onSend: (c: EmailCampaign) => void;
  onDelete: (c: EmailCampaign) => void;
  onViewAnalytics: (c: EmailCampaign) => void;
  disabled?: boolean;
}

function CampaignRow({
  campaign,
  onEdit,
  onSend,
  onDelete,
  onViewAnalytics,
  disabled,
}: CampaignRowProps) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 bg-white hover:shadow-sm transition-shadow">
      <div className="rounded-lg bg-green-50 p-2.5">
        <Mail className="h-5 w-5 text-green-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-900 truncate">{campaign.subject}</p>
          <StatusBadge status={campaign.status} />
        </div>
        {campaign.previewText && (
          <p className="text-sm text-gray-500 mt-0.5 truncate">{campaign.previewText}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">Created {formatDate(campaign.createdAt)}</p>
        {campaign.sendRecord && (
          <p className="text-xs text-gray-500 mt-0.5">
            Sent to {campaign.sendRecord.recipientCount} recipients on{" "}
            {formatDate(campaign.sendRecord.sentAt)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {campaign.status === "draft" && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onEdit(campaign)}
              disabled={disabled}
              aria-label={`Edit ${campaign.subject}`}
            >
              <Edit3 className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onSend(campaign)}
              disabled={disabled}
              className="bg-green-600 hover:bg-green-700 text-white"
              aria-label={`Send ${campaign.subject}`}
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              Send
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onDelete(campaign)}
              disabled={disabled}
              className="text-red-500 hover:text-red-700 hover:border-red-300"
              aria-label={`Delete ${campaign.subject}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {campaign.status === "sent" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onViewAnalytics(campaign)}
            disabled={disabled}
            aria-label={`View analytics for ${campaign.subject}`}
          >
            <BarChart3 className="h-3.5 w-3.5 mr-1" />
            Analytics
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Mock backer data shape for the send flow.
 * In production this would be fetched from the campaign backers API.
 */
const MOCK_BACKERS = [
  {
    backerAddress: "GBBB0000000000000000000000000000000000000001",
    email: "backer1@example.com",
    rewardTier: "Seedling",
    totalPledgeAmount: "250",
  },
  {
    backerAddress: "GBBB0000000000000000000000000000000000000002",
    email: "backer2@example.com",
    rewardTier: "Sapling",
    totalPledgeAmount: "1000",
  },
  {
    backerAddress: "GBBB0000000000000000000000000000000000000003",
    email: "backer3@example.com",
    rewardTier: "Forest Guardian",
    totalPledgeAmount: "5000",
  },
];

/** Available reward tiers for demo — in production, fetch from campaign sponsorship-tiers API. */
const DEMO_TIERS = ["Seedling", "Sapling", "Forest Guardian"];

export default function EmailCampaignsPage({ params }: PageProps) {
  const { id: campaignId } = use(params);

  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [view, setView] = useState<View>({ kind: "list" });
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const notify = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // ── Create / edit save handler ─────────────────────────────────────────────

  const handleSave = useCallback(
    async (data: {
      subject: string;
      previewText: string;
      blocks: EmailCampaign["blocks"];
      audience: EmailCampaign["audience"];
    }) => {
      setLoading(true);
      try {
        if (view.kind === "create") {
          const res = await fetch(`/api/campaigns/${campaignId}/email-campaigns`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              creatorAddress: "GCREATOR0000000000000000000000000000000000000", // replace with wallet
              ...data,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Create failed");
          setCampaigns((prev) => [json.campaign, ...prev]);
          notify("success", "Email campaign saved as draft.");
        } else if (view.kind === "edit") {
          const res = await fetch(
            `/api/campaigns/${campaignId}/email-campaigns/${view.campaign.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            },
          );
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Update failed");
          setCampaigns((prev) =>
            prev.map((c) => (c.id === view.campaign.id ? json.campaign : c)),
          );
          notify("success", "Email campaign updated.");
        }
        setView({ kind: "list" });
      } catch (err) {
        notify("error", err instanceof Error ? err.message : "Save failed");
      } finally {
        setLoading(false);
      }
    },
    [campaignId, view],
  );

  // ── Send handler ───────────────────────────────────────────────────────────

  const handleSend = useCallback(
    async (campaign: EmailCampaign) => {
      if (
        !window.confirm(
          `Send "${campaign.subject}" to your backer list? This cannot be undone.`,
        )
      )
        return;

      setLoading(true);
      try {
        const res = await fetch(
          `/api/campaigns/${campaignId}/email-campaigns/${campaign.id}/send`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // In production, fetch actual backers from the API instead
            body: JSON.stringify({ backers: MOCK_BACKERS }),
          },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Send failed");

        const updated: EmailCampaign = {
          ...campaign,
          status: "sent",
          sendRecord: json.sendRecord,
        };
        setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? updated : c)));
        notify(
          "success",
          `Sent to ${json.sendRecord.recipientCount} recipients.${
            json.sendRecord.errors.length > 0
              ? ` ${json.sendRecord.errors.length} failed.`
              : ""
          }`,
        );
      } catch (err) {
        notify("error", err instanceof Error ? err.message : "Send failed");
      } finally {
        setLoading(false);
      }
    },
    [campaignId],
  );

  // ── Delete handler ─────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (campaign: EmailCampaign) => {
      if (!window.confirm(`Delete "${campaign.subject}"? This cannot be undone.`)) return;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/campaigns/${campaignId}/email-campaigns/${campaign.id}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error ?? "Delete failed");
        }
        setCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
        notify("success", "Email campaign deleted.");
      } catch (err) {
        notify("error", err instanceof Error ? err.message : "Delete failed");
      } finally {
        setLoading(false);
      }
    },
    [campaignId],
  );

  // ── View analytics handler ─────────────────────────────────────────────────

  const handleViewAnalytics = useCallback(
    async (campaign: EmailCampaign) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/campaigns/${campaignId}/email-campaigns/${campaign.id}/analytics`,
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load analytics");
        setView({ kind: "analytics", campaign, analytics: json.analytics });
      } catch (err) {
        notify("error", err instanceof Error ? err.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    },
    [campaignId],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href={`/campaigns/${campaignId}`}
            className="text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Back to campaign"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Mail className="h-6 w-6 text-green-600" />
              Email campaigns
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Build and send styled emails to your backer list.
            </p>
          </div>
          {view.kind === "list" && (
            <Button
              type="button"
              onClick={() => setView({ kind: "create" })}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New campaign
            </Button>
          )}
        </div>

        {/* Notification */}
        {notification && (
          <div
            role="alert"
            className={`mb-5 flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
              notification.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {notification.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {notification.message}
          </div>
        )}

        {/* List view */}
        {view.kind === "list" && (
          <div className="space-y-3">
            {campaigns.length === 0 ? (
              <div className="text-center py-16 rounded-xl border-2 border-dashed border-gray-200 bg-white">
                <Mail className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No email campaigns yet</p>
                <p className="text-sm text-gray-400 mt-1">
                  Create your first campaign to engage your backers.
                </p>
                <Button
                  type="button"
                  onClick={() => setView({ kind: "create" })}
                  className="mt-4 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create campaign
                </Button>
              </div>
            ) : (
              campaigns.map((c) => (
                <CampaignRow
                  key={c.id}
                  campaign={c}
                  onEdit={(c) => setView({ kind: "edit", campaign: c })}
                  onSend={handleSend}
                  onDelete={handleDelete}
                  onViewAnalytics={handleViewAnalytics}
                  disabled={loading}
                />
              ))
            )}
          </div>
        )}

        {/* Create view */}
        {view.kind === "create" && (
          <div>
            <div className="flex items-center gap-2 mb-5">
              <button
                type="button"
                onClick={() => setView({ kind: "list" })}
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                ← Back to campaigns
              </button>
            </div>
            <EmailCampaignBuilder
              availableTiers={DEMO_TIERS}
              onSave={handleSave}
              disabled={loading}
            />
          </div>
        )}

        {/* Edit view */}
        {view.kind === "edit" && (
          <div>
            <div className="flex items-center gap-2 mb-5">
              <button
                type="button"
                onClick={() => setView({ kind: "list" })}
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                ← Back to campaigns
              </button>
            </div>
            <EmailCampaignBuilder
              initialData={{
                subject: view.campaign.subject,
                previewText: view.campaign.previewText,
                blocks: view.campaign.blocks,
                audience: view.campaign.audience,
              }}
              availableTiers={DEMO_TIERS}
              onSave={handleSave}
              disabled={loading}
            />
          </div>
        )}

        {/* Analytics view */}
        {view.kind === "analytics" && (
          <div>
            <div className="flex items-center gap-2 mb-5">
              <button
                type="button"
                onClick={() => setView({ kind: "list" })}
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                ← Back to campaigns
              </button>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-green-600" />
              Analytics: {view.campaign.subject}
            </h2>
            <EmailCampaignAnalyticsCard analytics={view.analytics} />
          </div>
        )}
      </div>
    </div>
  );
}
