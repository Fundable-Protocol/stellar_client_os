"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { useWallet } from "@/providers/StellarWalletProvider";
import type { SponsoredTree } from "@/services/forest-report.service";

interface ForestReportExportProps {
  trees?: SponsoredTree[];
  sponsorName?: string;
}

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

export default function ForestReportExport({
  trees = [],
  sponsorName,
}: ForestReportExportProps) {
  const { address } = useWallet();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canExport = Boolean(address && trees.length > 0 && !isExporting);

  async function exportReport() {
    if (!address || trees.length === 0) return;

    setIsExporting(true);
    setError(null);
    try {
      const response = await fetch("/api/reports/forest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsorName,
          sponsorAddress: address,
          trees,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Unable to generate the forest report");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const filename =
        contentDisposition?.match(/filename="([^"]+)"/)?.[1] ??
        "fundable-sponsor-forest.pdf";
      downloadBlob(blob, filename);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Unable to generate the forest report"
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Sponsor forest report</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Download a PDF summary of sponsored trees, proof photos, and annual carbon impact.
          </p>
        </div>
        <button
          type="button"
          onClick={exportReport}
          disabled={!canExport}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-fundable-purple-2 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-fundable-purple-2/90 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Download sponsor forest report"
        >
          {isExporting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileDown className="size-4" aria-hidden="true" />
          )}
          {isExporting ? "Preparing report…" : "Download PDF"}
        </button>
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        {!address
          ? "Connect your Stellar wallet to export your sponsor report."
          : trees.length === 0
            ? "No sponsored tree records are available to export yet."
            : `${trees.length} sponsored ${trees.length === 1 ? "tree" : "trees"} ready to export.`}
      </p>

      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
