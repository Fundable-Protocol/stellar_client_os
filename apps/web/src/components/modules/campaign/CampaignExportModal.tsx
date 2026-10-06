"use client";

import React, { useState } from "react";

export interface CampaignExportModalProps {
  campaignId: string;
  campaignName: string;
  isOpen: boolean;
  onClose: () => void;
}

export type ExportReportType = "full" | "sponsors" | "impact" | "timeline";
export type ExportFormat = "csv" | "json";

/**
 * CampaignExportModal Component (Issue #872)
 *
 * Allows campaign creators to export comprehensive data:
 * sponsors, pledged amounts, tree species planted, GPS locations, CO2 sequestration, and timeline.
 */
export const CampaignExportModal: React.FC<CampaignExportModalProps> = ({
  campaignId,
  campaignName,
  isOpen,
  onClose,
}) => {
  const [reportType, setReportType] = useState<ExportReportType>("full");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const url = `/api/campaigns/${encodeURIComponent(campaignId)}/export?report=${reportType}&format=${format}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `campaign-${campaignId}-${reportType}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="export-modal-title" className="text-lg font-bold text-white">
              Export Campaign Data
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{campaignName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1"
            aria-label="Close export dialog"
          >
            ✕
          </button>
        </div>

        {/* Report Scope Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Select Report Scope
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { id: "full", label: "Complete Report", desc: "Sponsors, impact, GPS and timeline" },
              { id: "sponsors", label: "Sponsor Ledger", desc: "Addresses, amounts and tokens" },
              { id: "impact", label: "Impact and Species", desc: "Trees, species, CO2 and GPS" },
              { id: "timeline", label: "Audit Timeline", desc: "State transitions and events" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setReportType(item.id as ExportReportType)}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                  reportType === item.id
                    ? "border-emerald-500 bg-emerald-950/40 text-emerald-200"
                    : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700"
                }`}
              >
                <span className="font-bold">{item.label}</span>
                <span className="text-[10px] text-slate-400 mt-1 leading-snug">{item.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* File Format Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            File Format
          </label>
          <div className="flex gap-3">
            {[
              { id: "csv", label: "CSV Spreadsheet (.csv)" },
              { id: "json", label: "JSON Object (.json)" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id as ExportFormat)}
                className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition text-center ${
                  format === f.id
                    ? "border-emerald-500 bg-emerald-950/50 text-emerald-300"
                    : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition"
          >
            {isExporting ? "Exporting..." : `Download ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
