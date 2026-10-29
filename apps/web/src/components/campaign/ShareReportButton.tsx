"use client";

import { useState } from "react";
import { Share2, Check, Download, FileText } from "lucide-react";

interface ShareReportButtonProps {
  campaignId: string;
  campaignName: string;
  shareUrl?: string;
  downloadUrl?: string;
}

export function ShareReportButton({
  campaignId,
  campaignName,
  shareUrl,
  downloadUrl = `/api/reports/campaign/${campaignId}`,
}: ShareReportButtonProps) {
  const [copied, setCopied] = useState(false);

  const effectiveShareUrl =
    shareUrl ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/campaigns/${campaignId}/impact-report`
      : `/campaigns/${campaignId}/impact-report`);

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${campaignName} - Campaign Impact Report`,
          text: `Check out the official impact report for ${campaignName} on Fundable Protocol!`,
          url: effectiveShareUrl,
        });
        return;
      } catch {
        // Fall back to clipboard if navigator.share fails or is dismissed
      }
    }

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(effectiveShareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleShare}
        aria-label="Share public impact report"
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-95"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" />
            <span>Link Copied!</span>
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4" />
            <span>Share Report</span>
          </>
        )}
      </button>

      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        download
        aria-label="Download official PDF impact report"
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
      >
        <Download className="h-4 w-4" />
        <span>Download PDF</span>
      </a>
    </div>
  );
}

export default ShareReportButton;
