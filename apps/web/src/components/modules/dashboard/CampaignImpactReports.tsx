"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@/providers/StellarWalletProvider";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Download,
  Share2,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Trees,
  Users,
  DollarSign,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface CreatorReportItem {
  id: string;
  campaignId: string;
  campaignName: string;
  creator: string;
  status: string;
  generatedAt: number;
  closedAt: number;
  publicUrl: string;
  publicShareUrl: string;
  downloadUrl: string;
  emailSent: boolean;
  treeCount: number;
  co2KgPerYear: number;
  campaignPerformance?: {
    status: string;
    raisedAmount: string;
    goalAmount: string;
    sponsorCount: number;
    treeCount: number;
    co2KgPerYear: number;
  };
}

export function CampaignImpactReports() {
  const { address } = useWallet();
  const effectiveAddress = address || "GBREAKER1";
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ reports: CreatorReportItem[] }>({
    queryKey: ["creator-impact-reports", effectiveAddress],
    queryFn: async () => {
      const res = await fetch(`/api/creators/${effectiveAddress}/impact-reports`);
      if (!res.ok) throw new Error("Failed to load impact reports");
      return res.json();
    },
    enabled: !!effectiveAddress,
  });

  const reports = data?.reports ?? [];

  const handleCopyLink = async (campaignId: string, publicUrl: string) => {
    const fullUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${publicUrl}`
        : publicUrl;

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedId(campaignId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
        <Skeleton className="h-6 w-56 bg-zinc-800" />
        <Skeleton className="h-20 w-full rounded-xl bg-zinc-800" />
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 mb-8"
      data-testid="campaign-impact-reports-dashboard"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-2">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-400" />
            Campaign Impact Reports
          </h2>
          <p className="text-sm text-zinc-400">
            Automatically generated within 24 hours of campaign close. Download your official PDF or share the public link.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-purple-500/10 px-3 py-1.5 rounded-full border border-purple-500/20 text-xs text-purple-300">
          <Clock className="w-3.5 h-3.5" />
          <span>Auto-Generated at Close</span>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
          <p className="text-sm font-medium text-zinc-300">
            No closed campaign reports yet
          </p>
          <p className="mt-1 text-xs text-zinc-500 max-w-md mx-auto">
            When your campaigns complete or close, an official PDF impact report is automatically generated within 24 hours and delivered here and via email.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const isCopied = copiedId === report.campaignId;
            const closedDate = new Date(report.closedAt).toLocaleDateString();
            const generatedDate = new Date(report.generatedAt).toLocaleDateString();

            return (
              <div
                key={report.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 hover:bg-zinc-800/20 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white text-base">
                      {report.campaignName}
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Report Ready
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
                    <span className="flex items-center gap-1 text-green-400">
                      <Trees className="w-3.5 h-3.5" />
                      {report.treeCount.toLocaleString()} trees
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      ~{report.co2KgPerYear.toFixed(1)} kg CO₂/yr
                    </span>
                    <span>•</span>
                    <span>Closed: {closedDate}</span>
                    <span>•</span>
                    <span>Generated: {generatedDate}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={report.publicUrl}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View Report</span>
                  </Link>

                  <a
                    href={report.downloadUrl}
                    download
                    className="inline-flex items-center gap-1.5 rounded-lg bg-fundable-purple-2 px-3 py-1.5 text-xs font-medium text-white hover:bg-fundable-purple-2/90 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => handleCopyLink(report.campaignId, report.publicUrl)}
                    aria-label="Copy public shareable report link"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700/60 transition"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Share Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default CampaignImpactReports;
