"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, FileText, Loader2, type LucideIcon } from "lucide-react";
import { useWallet } from "@/providers/StellarWalletProvider";
import type { CreatorStats } from "@/services/creator-stats.service";

type ExportFormat = "csv" | "pdf";

interface ExportCampaign {
  id: string;
  status: string;
}

const FORMAT_OPTIONS: Array<{
  format: ExportFormat;
  report: "backers" | "analytics";
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    format: "csv",
    report: "backers",
    label: "Download CSV",
    description: "Every backer, pledge amount, reward tier and privacy setting",
    icon: FileSpreadsheet,
  },
  {
    format: "pdf",
    report: "analytics",
    label: "Download PDF",
    description: "Analytics report with funding and reward-tier charts",
    icon: FileText,
  },
];

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function filenameFromResponse(response: Response, fallback: string): string {
  const disposition = response.headers.get("Content-Disposition");
  return disposition?.match(/filename="([^"]+)"/)?.[1] ?? fallback;
}

/**
 * Creator dashboard export panel (issue #1184).
 *
 * Lists the creator's campaigns and downloads either the complete backer CSV
 * or the charted PDF analytics report from the campaign export API.
 */
export default function CampaignDataExport() {
  const { address } = useWallet();
  const [campaignId, setCampaignId] = useState("");
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: campaigns = [], isLoading } = useQuery<ExportCampaign[]>({
    queryKey: ["creator-export-campaigns", address],
    queryFn: async () => {
      const response = await fetch(
        `/api/campaigns/creator-stats?creator=${encodeURIComponent(address ?? "")}`,
      );
      if (!response.ok) throw new Error("Unable to load your campaigns");
      const payload = (await response.json()) as { data?: CreatorStats };
      return (payload.data?.campaigns ?? []).map((campaign) => ({
        id: campaign.id,
        status: campaign.status,
      }));
    },
    enabled: Boolean(address),
  });

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === campaignId),
    [campaigns, campaignId],
  );

  useEffect(() => {
    if (!campaignId && campaigns.length > 0) {
      setCampaignId(campaigns[0].id);
    }
  }, [campaignId, campaigns]);

  const canExport = Boolean(address && campaignId && !exporting);

  async function exportCampaign(format: ExportFormat, report: "backers" | "analytics") {
    if (!address || !campaignId) return;

    setExporting(format);
    setError(null);
    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/export?report=${report}&format=${format}`,
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to export campaign data");
      }

      const blob = await response.blob();
      downloadBlob(
        blob,
        filenameFromResponse(response, `campaign-${campaignId}-${report}.${format}`),
      );
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Unable to export campaign data",
      );
    } finally {
      setExporting(null);
    }
  }

  return (
    <section
      className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
      data-testid="campaign-data-export"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <FileDown className="size-5 text-emerald-400" aria-hidden="true" />
            Export campaign data
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Download your backer list, pledge amounts, reward tier selections and campaign
            analytics for accounting, reporting or your own tools.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <label className="sr-only" htmlFor="campaign-export-select">
            Campaign to export
          </label>
          <select
            id="campaign-export-select"
            data-testid="campaign-export-select"
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
            disabled={!address || isLoading || campaigns.length === 0}
            className="h-10 min-w-[190px] rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 outline-none transition-colors focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {campaigns.length === 0 && <option value="">No campaigns yet</option>}
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                Campaign #{campaign.id} · {campaign.status}
              </option>
            ))}
          </select>

          {FORMAT_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isExporting = exporting === option.format;
            return (
              <button
                key={option.format}
                type="button"
                data-testid={`campaign-export-${option.format}`}
                onClick={() => exportCampaign(option.format, option.report)}
                disabled={!canExport}
                title={option.description}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isExporting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Icon className="size-4" aria-hidden="true" />
                )}
                {isExporting ? "Preparing…" : option.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        {!address
          ? "Connect your Stellar wallet to export your campaign data."
          : isLoading
            ? "Loading your campaigns…"
            : campaigns.length === 0
              ? "Create a campaign to unlock data exports."
              : selectedCampaign
                ? `Exporting campaign #${selectedCampaign.id}. CSV contains every backer field; PDF includes charts.`
                : "Choose a campaign to export."}
      </p>

      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
