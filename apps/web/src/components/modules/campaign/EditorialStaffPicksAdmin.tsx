"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowLeft, Plus, Trash2, CheckCircle2, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { StaffPickBadge } from "@/components/modules/campaign/StaffPickBadge";
import { useCampaigns } from "@/hooks/use-campaigns";

interface StaffPickItem {
  id: string;
  name?: string;
  title?: string;
  isStaffPick?: boolean;
  staffPickReason?: string;
  category?: string;
  status?: string;
}

export function EditorialStaffPicksAdmin() {
  const { campaigns } = useCampaigns();
  const [picks, setPicks] = useState<StaffPickItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminKey, setAdminKey] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [reason, setReason] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Try to load admin key from session/local storage if previously saved
    const savedKey = typeof window !== "undefined" ? window.sessionStorage.getItem("fundable_admin_key") : null;
    if (savedKey) {
      setAdminKey(savedKey);
    }
  }, []);

  const fetchPicks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns/staff-picks");
      if (res.ok) {
        const json = await res.json();
        setPicks(json.data ?? []);
      }
    } catch {
      setStatusMessage({ type: "error", text: "Failed to load current Staff Picks." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPicks();
  }, []);

  const handleAdminKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAdminKey(val);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("fundable_admin_key", val);
    }
  };

  const handleAddPick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaignId) {
      setStatusMessage({ type: "error", text: "Please select or enter a campaign ID." });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/admin/campaigns/${encodeURIComponent(selectedCampaignId)}/staff-pick`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(adminKey ? { Authorization: `Bearer ${adminKey.trim()}` } : {}),
        },
        body: JSON.stringify({
          reason: reason.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed with status ${res.status}`);
      }

      setStatusMessage({ type: "success", text: `Successfully curated ${selectedCampaignId} as Staff Pick!` });
      setSelectedCampaignId("");
      setReason("");
      await fetchPicks();
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to add Staff Pick. Check your admin authorization.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemovePick = async (campaignId: string) => {
    if (!confirm(`Are you sure you want to remove ${campaignId} from Staff Picks?`)) return;

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/admin/campaigns/${encodeURIComponent(campaignId)}/staff-pick`, {
        method: "DELETE",
        headers: {
          ...(adminKey ? { Authorization: `Bearer ${adminKey.trim()}` } : {}),
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed with status ${res.status}`);
      }

      setStatusMessage({ type: "success", text: `Removed ${campaignId} from Staff Picks.` });
      setPicks((prev) => prev.filter((p) => p.id !== campaignId));
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to remove Staff Pick. Check your admin authorization.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/campaigns"
              className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Back to Campaigns
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-50 tracking-tight flex items-center gap-2.5">
            <Sparkles className="h-7 w-7 text-amber-400" />
            Editorial Staff Picks Admin
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Curate and manage featured campaigns for the browse and homepage Staff Picks collection.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchPicks}
          disabled={loading}
          className="border-zinc-700 text-zinc-300 hover:text-white self-start sm:self-auto"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh Picks
        </Button>
      </div>

      {/* Admin Authorization Token */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="admin-key" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Admin Bearer Token
          </label>
          <span className="text-[11px] text-zinc-500">Required for privileged curation updates</span>
        </div>
        <Input
          id="admin-key"
          type="password"
          placeholder="Enter ADMIN_API_KEY..."
          value={adminKey}
          onChange={handleAdminKeyChange}
          className="bg-zinc-950 border-zinc-700 text-zinc-100 font-mono text-xs"
        />
      </div>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2.5 ${
            statusMessage.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Curation Add Form */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 space-y-4 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
          <Plus className="h-4 w-4 text-amber-400" /> Feature a Campaign
        </h2>

        <form onSubmit={handleAddPick} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="campaign-select" className="block text-xs font-medium text-zinc-400 mb-1">
                Select Active Campaign
              </label>
              <select
                id="campaign-select"
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="w-full h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">-- Choose a campaign or enter ID below --</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="campaign-id-input" className="block text-xs font-medium text-zinc-400 mb-1">
                Or Type Campaign ID
              </label>
              <Input
                id="campaign-id-input"
                placeholder="e.g. camp-101"
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="bg-zinc-950 border-zinc-700 text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="reason-input" className="block text-xs font-medium text-zinc-400 mb-1">
              Editorial Recommendation Note
            </label>
            <Input
              id="reason-input"
              placeholder="e.g. Exceptional biodiversity restoration and verified community land stewardship."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-zinc-950 border-zinc-700 text-zinc-100"
            />
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || !selectedCampaignId}
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-semibold text-xs shadow-md"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Feature as Staff Pick
          </Button>
        </form>
      </div>

      {/* Current Staff Picks Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden shadow-xl">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-zinc-100">Current Staff Picks ({picks.length})</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Campaigns currently bearing the Staff Pick badge and featured section placement.</p>
          </div>
        </div>

        {picks.length === 0 ? (
          <div className="p-10 text-center text-zinc-500 text-xs">
            No campaigns currently designated as Staff Picks. Use the form above to curate one.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {picks.map((pick) => (
              <div
                key={pick.id}
                className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:bg-zinc-900/40 transition-colors"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <StaffPickBadge reason={pick.staffPickReason} size="sm" />
                    <span className="text-xs font-mono text-zinc-400">ID: {pick.id}</span>
                  </div>
                  <h3 className="text-base font-bold text-zinc-100">
                    {pick.name || pick.title || pick.id}
                  </h3>
                  {pick.staffPickReason && (
                    <p className="text-xs text-amber-300/80 italic">
                      “{pick.staffPickReason}”
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/campaigns/${pick.id}`} target="_blank">
                    <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:text-white text-xs">
                      View <ExternalLink className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => handleRemovePick(pick.id)}
                    className="border-rose-900/40 bg-rose-950/20 text-rose-300 hover:bg-rose-900/40 hover:text-rose-200 text-xs"
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Remove Pick
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
