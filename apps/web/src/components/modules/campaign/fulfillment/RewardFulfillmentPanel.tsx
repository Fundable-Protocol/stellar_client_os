"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Download,
  Upload,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Edit2,
  Save,
  X,
  Trash2,
  Search,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CSVImportResult,
  RewardFulfillmentInput,
  RewardFulfillmentRecord,
  ShippingStatus,
  SHIPPING_STATUSES,
} from "@/types/reward-fulfillment";
import {
  downloadFulfillmentCSVTemplate,
  parseFulfillmentCSV,
  rewardFulfillmentService,
  validateFulfillmentRecord,
} from "@/services/reward-fulfillment.service";

export interface RewardFulfillmentPanelProps {
  campaignId: string;
  campaignTitle?: string;
  creatorAddress?: string;
  viewerAddress?: string;
  isCreator?: boolean;
}

const STATUS_BADGE_STYLES: Record<ShippingStatus, string> = {
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  processing: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  shipped: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  delivered: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  cancelled: "border-zinc-600 bg-zinc-800 text-zinc-400",
};

/**
 * Creator Reward Fulfillment Panel.
 *
 * Allows campaign creators to:
 * 1. Download the structured CSV template for physical reward shipping addresses
 * 2. Bulk import backer shipping addresses via CSV with full validation and error flagging before saving
 * 3. View, filter, and edit imported addresses per backer row with instant validation
 */
export function RewardFulfillmentPanel({
  campaignId,
  campaignTitle,
  creatorAddress,
  viewerAddress,
  isCreator = true,
}: RewardFulfillmentPanelProps) {
  // Master list of saved fulfillments for this campaign
  const [fulfillments, setFulfillments] = useState<RewardFulfillmentRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Import flow state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvRawText, setCsvRawText] = useState("");
  const [importResult, setImportResult] = useState<CSVImportResult | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Per-row editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<RewardFulfillmentRecord> | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [rowSuccessNotice, setRowSuccessNotice] = useState<{ id: string; text: string } | null>(null);

  // Load fulfillments on mount / campaignId change
  useEffect(() => {
    rewardFulfillmentService.seedDemoFulfillments(campaignId);
    const records = rewardFulfillmentService.getFulfillments(campaignId);
    setFulfillments(records);
  }, [campaignId]);

  // Handle CSV file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvRawText(text);
      const result = parseFulfillmentCSV(text);
      setImportResult(result);
      setImportSuccessMessage(null);
    };
    reader.readAsText(file);
  };

  // Re-validate when raw text changes manually
  const handleRawTextChange = (text: string) => {
    setCsvRawText(text);
    if (!text.trim()) {
      setImportResult(null);
      return;
    }
    const result = parseFulfillmentCSV(text);
    setImportResult(result);
    setImportSuccessMessage(null);
  };

  // Confirm saving valid imported records
  const handleSaveImportedRecords = (onlyValid = false) => {
    if (!importResult) return;

    const rowsToSave = onlyValid
      ? importResult.rows.filter((r) => r.isValid && r.record)
      : importResult.rows.filter((r) => r.record);

    if (rowsToSave.length === 0) return;

    const inputs: RewardFulfillmentInput[] = rowsToSave.map((r) => r.record!);

    try {
      const updated = rewardFulfillmentService.saveFulfillments(campaignId, inputs);
      setFulfillments(updated);
      setImportSuccessMessage(
        `Successfully imported and saved ${inputs.length} backer shipping address${inputs.length === 1 ? "" : "es"}!`,
      );
      // Reset staging
      setCsvRawText("");
      setImportResult(null);
      setImportFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error("Failed to save imported fulfillments:", err);
    }
  };

  // Reset import staging
  const handleCancelImport = () => {
    setCsvRawText("");
    setImportResult(null);
    setImportFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsImportOpen(false);
  };

  // Start editing a backer row
  const handleStartEdit = (record: RewardFulfillmentRecord) => {
    setEditingId(record.id);
    setEditDraft({ ...record });
    setEditError(null);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
  };

  // Save an edited row with validation
  const handleSaveEdit = (id: string) => {
    if (!editDraft) return;

    const validation = validateFulfillmentRecord(editDraft);
    if (!validation.isValid) {
      setEditError(validation.errors.map((e) => e.message).join("; "));
      return;
    }

    try {
      const updated = rewardFulfillmentService.updateFulfillment(campaignId, id, editDraft);
      setFulfillments((prev) => prev.map((item) => (item.id === id ? updated : item)));
      setEditingId(null);
      setEditDraft(null);
      setEditError(null);
      setRowSuccessNotice({ id, text: "Address updated successfully" });
      setTimeout(() => setRowSuccessNotice(null), 3500);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save address update");
    }
  };

  // Delete a row
  const handleDeleteRow = (id: string) => {
    if (!window.confirm("Are you sure you want to remove this backer shipping address?")) return;
    const ok = rewardFulfillmentService.deleteFulfillment(campaignId, id);
    if (ok) {
      setFulfillments((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // Export current list to CSV
  const handleExportCSV = () => {
    const csvContent = rewardFulfillmentService.exportFulfillmentsToCSV(campaignId);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-${campaignId}-fulfillment-addresses.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filtered fulfillments list
  const filteredFulfillments = useMemo(() => {
    return fulfillments.filter((rec) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !query ||
        rec.backerAddress.toLowerCase().includes(query) ||
        rec.recipientName.toLowerCase().includes(query) ||
        rec.city.toLowerCase().includes(query) ||
        rec.country.toLowerCase().includes(query) ||
        rec.rewardTier.toLowerCase().includes(query) ||
        (rec.trackingNumber && rec.trackingNumber.toLowerCase().includes(query));

      const matchesStatus = statusFilter === "all" || rec.shippingStatus === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [fulfillments, searchQuery, statusFilter]);

  // Aggregate statistics
  const stats = useMemo(() => {
    const total = fulfillments.length;
    const pending = fulfillments.filter((r) => r.shippingStatus === "pending").length;
    const processing = fulfillments.filter((r) => r.shippingStatus === "processing").length;
    const shipped = fulfillments.filter((r) => r.shippingStatus === "shipped").length;
    const delivered = fulfillments.filter((r) => r.shippingStatus === "delivered").length;
    return { total, pending, processing, shipped, delivered };
  }, [fulfillments]);

  return (
    <div className="space-y-6">
      {/* Header and Creator Action Bar */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 backdrop-blur-sm space-y-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-900/60 text-purple-300 border border-purple-700/50">
                <Package className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold text-zinc-100">Reward Fulfillment & Shipping</h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
              {campaignTitle ? `${campaignTitle} · ` : ""}
              Download the structured CSV template, import backer shipping addresses in bulk, and manage fulfillment
              status per backer row.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Acceptance Criteria 1: CSV template download in creator reward fulfillment panel */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadFulfillmentCSVTemplate()}
              className="border-purple-600/50 bg-purple-950/30 text-purple-200 hover:bg-purple-900/40 text-xs font-semibold"
              title="Download structured CSV template with standard shipping columns"
            >
              <Download className="mr-1.5 h-3.5 w-3.5 text-purple-400" />
              Download CSV Template
            </Button>

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setIsImportOpen(!isImportOpen)}
              className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-900/20"
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {isImportOpen ? "Close Import Drawer" : "Bulk Import CSV"}
            </Button>

            {fulfillments.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="border-zinc-700 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700 text-xs"
                title="Export all saved addresses to CSV"
              >
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
                Export CSV
              </Button>
            )}
          </div>
        </div>

        {/* Status Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
            <span className="text-[11px] font-medium text-zinc-400">Total Backers</span>
            <div className="text-xl font-bold text-zinc-100 mt-0.5">{stats.total}</div>
          </div>
          <div className="rounded-xl border border-amber-900/30 bg-amber-950/20 p-3">
            <span className="text-[11px] font-medium text-amber-400">Pending</span>
            <div className="text-xl font-bold text-amber-200 mt-0.5">{stats.pending}</div>
          </div>
          <div className="rounded-xl border border-sky-900/30 bg-sky-950/20 p-3">
            <span className="text-[11px] font-medium text-sky-400">Processing</span>
            <div className="text-xl font-bold text-sky-200 mt-0.5">{stats.processing}</div>
          </div>
          <div className="rounded-xl border border-purple-900/30 bg-purple-950/20 p-3">
            <span className="text-[11px] font-medium text-purple-400">Shipped</span>
            <div className="text-xl font-bold text-purple-200 mt-0.5">{stats.shipped}</div>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/20 p-3">
            <span className="text-[11px] font-medium text-emerald-400">Delivered</span>
            <div className="text-xl font-bold text-emerald-200 mt-0.5">{stats.delivered}</div>
          </div>
        </div>
      </div>

      {/* Global Success Notification after import */}
      {importSuccessMessage && (
        <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/30 p-4 flex items-center justify-between text-emerald-200 text-sm">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <span>{importSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportSuccessMessage(null)}
            className="text-emerald-400 hover:text-emerald-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Acceptance Criteria 2: Bulk CSV Import Modal / Drawer with Validation & Error Flagging */}
      {isImportOpen && (
        <section
          aria-label="CSV Bulk Import Area"
          className="rounded-2xl border border-purple-700/40 bg-zinc-900/90 p-6 space-y-6 shadow-2xl animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Upload className="h-4 w-4 text-purple-400" />
                Bulk Import Shipping Addresses from CSV
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Upload your completed fulfillment CSV. All addresses are automatically validated and flagged for errors
                before saving.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleCancelImport}
              className="text-zinc-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Upload Area */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950/60 p-6 text-center hover:border-purple-500/70 transition cursor-pointer relative">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                aria-label="Upload CSV File"
              />
              <FileSpreadsheet className="h-10 w-10 text-purple-400 mb-2" />
              <p className="text-sm font-semibold text-zinc-200">
                {importFileName ? importFileName : "Click or drag & drop CSV file here"}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Accepts .csv formatted shipping files (RFC 4180)</p>
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-zinc-700 text-zinc-300 pointer-events-none"
                >
                  Choose File
                </Button>
              </div>
            </div>

            {/* Direct Paste or Raw Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="csv-raw-input" className="text-xs font-semibold text-zinc-300">
                  Or Paste Raw CSV Text
                </label>
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  onClick={() => downloadFulfillmentCSVTemplate()}
                  className="text-purple-400 hover:text-purple-300 p-0 h-auto text-xs"
                >
                  <Download className="mr-1 h-3 w-3" /> Get CSV Template
                </Button>
              </div>
              <textarea
                id="csv-raw-input"
                rows={5}
                value={csvRawText}
                onChange={(e) => handleRawTextChange(e.target.value)}
                placeholder="Backer Address,Recipient Name,Address Line 1,City,Postal Code,Country&#10;GB44...R771,Jane Doe,123 Pine St,Portland,97201,United States"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-purple-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Validation Diagnostics / Error Flagging Section */}
          {importResult && (
            <div className="space-y-4 pt-2 border-t border-zinc-800">
              {/* Summary Banner */}
              <div
                className={`rounded-xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  importResult.isValid
                    ? "border-emerald-800/60 bg-emerald-950/20 text-emerald-200"
                    : "border-red-800/60 bg-red-950/20 text-red-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  {importResult.isValid ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-6 w-6 text-red-400 shrink-0" />
                  )}
                  <div>
                    <h4 className="font-bold text-sm">
                      {importResult.isValid
                        ? `Validation Passed: Ready to Import ${importResult.validCount} Addresses`
                        : `Validation Flagged ${importResult.errorCount} Error${importResult.errorCount === 1 ? "" : "s"}`}
                    </h4>
                    <p className="text-xs opacity-90 mt-0.5">
                      {importResult.totalRows} rows processed &middot; {importResult.validCount} valid &middot;{" "}
                      {importResult.errorCount} with errors &middot; {importResult.warningCount} warnings
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancelImport}
                    className="border-zinc-700 text-zinc-300 hover:text-white text-xs"
                  >
                    Cancel
                  </Button>

                  {importResult.isValid ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSaveImportedRecords(false)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
                    >
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      Save All ({importResult.validCount}) Addresses
                    </Button>
                  ) : importResult.validCount > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSaveImportedRecords(true)}
                      className="bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs"
                    >
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      Save Only Valid Rows ({importResult.validCount})
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled
                      className="bg-zinc-800 text-zinc-500 cursor-not-allowed text-xs"
                    >
                      Fix Errors to Save
                    </Button>
                  )}
                </div>
              </div>

              {/* Granular Error List */}
              {importResult.errors.length > 0 && (
                <div className="rounded-xl border border-red-900/40 bg-red-950/10 p-4 space-y-2">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" /> Address Errors to Fix Before Saving
                  </h5>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2">
                    {importResult.errors.map((err, idx) => (
                      <div
                        key={`err-${idx}`}
                        className="rounded-lg border border-red-900/30 bg-red-950/30 p-2.5 text-xs text-red-200 flex items-start justify-between gap-2"
                      >
                        <div>
                          <strong className="text-red-300">
                            {err.row > 0 ? `Row ${err.row}` : "Header"}: {err.field}
                          </strong>
                          <span className="mx-1.5 text-red-500">&mdash;</span>
                          <span>{err.message}</span>
                        </div>
                        {err.value && (
                          <span className="rounded bg-red-950 px-1.5 py-0.5 font-mono text-[11px] text-red-300">
                            Value: &ldquo;{err.value}&rdquo;
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings (e.g. duplicate addresses) */}
              {importResult.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4 space-y-2">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Import Warnings
                  </h5>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-2">
                    {importResult.warnings.map((warn, idx) => (
                      <div
                        key={`warn-${idx}`}
                        className="rounded-lg border border-amber-900/30 bg-amber-950/30 p-2 text-xs text-amber-200"
                      >
                        <strong className="text-amber-300">Row {warn.row}:</strong> {warn.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Staging Rows Preview Table */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 overflow-hidden">
                <div className="p-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-300">Import Preview & Status</span>
                  <span className="text-xs text-zinc-500">
                    {importResult.validCount} valid / {importResult.totalRows} total rows
                  </span>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-900 text-zinc-400 font-semibold sticky top-0">
                      <tr>
                        <th className="p-2.5">Row</th>
                        <th className="p-2.5">Validation</th>
                        <th className="p-2.5">Backer Address</th>
                        <th className="p-2.5">Recipient</th>
                        <th className="p-2.5">Reward Tier</th>
                        <th className="p-2.5">Street Address</th>
                        <th className="p-2.5">City, State, Zip, Country</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 text-zinc-300 font-mono text-[11px]">
                      {importResult.rows.map((row) => (
                        <tr
                          key={`staged-${row.rowNumber}`}
                          className={row.isValid ? "hover:bg-zinc-900/40" : "bg-red-950/15 hover:bg-red-950/25"}
                        >
                          <td className="p-2.5 font-sans font-medium text-zinc-400">#{row.rowNumber}</td>
                          <td className="p-2.5">
                            {row.isValid ? (
                              <Badge className="bg-emerald-600/30 text-emerald-300 border-emerald-600/50 text-[10px]">
                                Valid
                              </Badge>
                            ) : (
                              <Badge className="bg-red-600/30 text-red-300 border-red-600/50 text-[10px]">
                                {row.errors.length} Error{row.errors.length === 1 ? "" : "s"}
                              </Badge>
                            )}
                          </td>
                          <td className="p-2.5">{row.rawData["Backer Address"] || row.rawData["backerAddress"] || "—"}</td>
                          <td className="p-2.5 font-sans">
                            {row.rawData["Recipient Name"] || row.rawData["recipientName"] || "—"}
                          </td>
                          <td className="p-2.5 font-sans">
                            {row.rawData["Reward Tier"] || row.rawData["rewardTier"] || "Standard Physical Reward"}
                          </td>
                          <td className="p-2.5 font-sans">
                            {row.rawData["Address Line 1"] || row.rawData["addressLine1"] || "—"}
                          </td>
                          <td className="p-2.5 font-sans">
                            {[
                              row.rawData["City"] || row.rawData["city"],
                              row.rawData["State/Province"] || row.rawData["state"],
                              row.rawData["Postal Code"] || row.rawData["postalCode"],
                              row.rawData["Country"] || row.rawData["country"],
                            ]
                              .filter(Boolean)
                              .join(", ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Acceptance Criteria 3: Master Fulfillment Table - Editable per backer row */}
      <section aria-label="Fulfillment Addresses Table" className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by backer, recipient, city, tracking..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="filter-status-select" className="text-xs text-zinc-400 font-medium whitespace-nowrap">
              Status:
            </label>
            <select
              id="filter-status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 focus:border-purple-500 focus:outline-none"
            >
              <option value="all">All Statuses ({fulfillments.length})</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Edit Error Alert if any */}
        {editError && (
          <div className="rounded-xl border border-red-800/60 bg-red-950/30 p-3.5 text-xs text-red-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{editError}</span>
            </div>
            <button type="button" onClick={() => setEditError(null)} className="text-red-400 hover:text-red-200">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Table of Backers */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Backer & Recipient</th>
                  <th className="py-3 px-4">Reward Tier</th>
                  <th className="py-3 px-4">Shipping Address</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Tracking Number</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
                {filteredFulfillments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-500">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Package className="h-8 w-8 text-zinc-600" />
                        <p className="text-sm font-medium text-zinc-400">No fulfillment records found</p>
                        <p className="text-xs text-zinc-600 max-w-sm">
                          {searchQuery || statusFilter !== "all"
                            ? "Try clearing your search or status filter"
                            : "Download the CSV template and import backer shipping addresses to get started"}
                        </p>
                        {!searchQuery && statusFilter === "all" && (
                          <div className="pt-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsImportOpen(true)}
                              className="border-purple-600/50 text-purple-300 hover:bg-purple-950/30 text-xs"
                            >
                              <Upload className="mr-1.5 h-3.5 w-3.5" /> Bulk Import CSV
                            </Button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredFulfillments.map((record) => {
                    const isEditing = editingId === record.id;
                    const isRowNotice = rowSuccessNotice?.id === record.id;

                    if (isEditing && editDraft) {
                      return (
                        <tr key={record.id} className="bg-purple-950/20">
                          {/* Backer & Recipient Edit */}
                          <td className="py-3 px-4 align-top">
                            <div className="space-y-1.5">
                              <span className="font-mono text-[10px] text-zinc-500 block truncate max-w-[140px]">
                                {record.backerAddress}
                              </span>
                              <div>
                                <label className="text-[10px] text-zinc-400 block">Recipient Name *</label>
                                <input
                                  type="text"
                                  value={editDraft.recipientName ?? ""}
                                  onChange={(e) => setEditDraft({ ...editDraft, recipientName: e.target.value })}
                                  placeholder="Full Name"
                                  className="w-full rounded border border-purple-500/50 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                                />
                              </div>
                            </div>
                          </td>

                          {/* Reward Tier Edit */}
                          <td className="py-3 px-4 align-top">
                            <label className="text-[10px] text-zinc-400 block">Reward Tier</label>
                            <input
                              type="text"
                              value={editDraft.rewardTier ?? ""}
                              onChange={(e) => setEditDraft({ ...editDraft, rewardTier: e.target.value })}
                              placeholder="Reward Tier"
                              className="w-full rounded border border-purple-500/50 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                            />
                          </td>

                          {/* Address Fields Edit */}
                          <td className="py-3 px-4 align-top">
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={editDraft.addressLine1 ?? ""}
                                onChange={(e) => setEditDraft({ ...editDraft, addressLine1: e.target.value })}
                                placeholder="Address Line 1 *"
                                className="w-full rounded border border-purple-500/50 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                              />
                              <input
                                type="text"
                                value={editDraft.addressLine2 ?? ""}
                                onChange={(e) => setEditDraft({ ...editDraft, addressLine2: e.target.value })}
                                placeholder="Apt, Suite, Unit (optional)"
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                              />
                              <div className="grid grid-cols-2 gap-1 pt-1">
                                <input
                                  type="text"
                                  value={editDraft.city ?? ""}
                                  onChange={(e) => setEditDraft({ ...editDraft, city: e.target.value })}
                                  placeholder="City *"
                                  className="rounded border border-purple-500/50 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={editDraft.state ?? ""}
                                  onChange={(e) => setEditDraft({ ...editDraft, state: e.target.value })}
                                  placeholder="State/Prov"
                                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-1 pt-1">
                                <input
                                  type="text"
                                  value={editDraft.postalCode ?? ""}
                                  onChange={(e) => setEditDraft({ ...editDraft, postalCode: e.target.value })}
                                  placeholder="Postal Code *"
                                  className="rounded border border-purple-500/50 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={editDraft.country ?? ""}
                                  onChange={(e) => setEditDraft({ ...editDraft, country: e.target.value })}
                                  placeholder="Country *"
                                  className="rounded border border-purple-500/50 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                                />
                              </div>
                            </div>
                          </td>

                          {/* Phone Edit */}
                          <td className="py-3 px-4 align-top">
                            <label className="text-[10px] text-zinc-400 block">Phone</label>
                            <input
                              type="text"
                              value={editDraft.phone ?? ""}
                              onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })}
                              placeholder="+1-555-..."
                              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                            />
                          </td>

                          {/* Status Edit */}
                          <td className="py-3 px-4 align-top">
                            <label className="text-[10px] text-zinc-400 block">Status</label>
                            <select
                              value={editDraft.shippingStatus ?? "pending"}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, shippingStatus: e.target.value as ShippingStatus })
                              }
                              className="w-full rounded border border-purple-500/50 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                            >
                              {SHIPPING_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st.charAt(0).toUpperCase() + st.slice(1)}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Tracking Number Edit */}
                          <td className="py-3 px-4 align-top">
                            <label className="text-[10px] text-zinc-400 block">Tracking #</label>
                            <input
                              type="text"
                              value={editDraft.trackingNumber ?? ""}
                              onChange={(e) => setEditDraft({ ...editDraft, trackingNumber: e.target.value })}
                              placeholder="Carrier tracking #"
                              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white focus:outline-none"
                            />
                          </td>

                          {/* Row Edit Save / Cancel */}
                          <td className="py-3 px-4 align-top text-right">
                            <div className="flex items-center justify-end gap-1.5 pt-3">
                              <Button
                                type="button"
                                size="xs"
                                onClick={() => handleSaveEdit(record.id)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                                title="Save changes"
                              >
                                <Save className="h-3 w-3 mr-1" /> Save
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={handleCancelEdit}
                                className="text-zinc-400 hover:text-white"
                                title="Cancel editing"
                              >
                                Cancel
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={record.id} className="hover:bg-zinc-900/40 transition-colors">
                        {/* Backer & Recipient */}
                        <td className="py-3 px-4">
                          <div className="font-medium text-zinc-100">{record.recipientName}</div>
                          <div className="font-mono text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                            <span className="truncate max-w-[140px]" title={record.backerAddress}>
                              {record.backerAddress}
                            </span>
                          </div>
                          {isRowNotice && (
                            <span className="text-[10px] text-emerald-400 font-semibold block mt-1">
                              ✓ {rowSuccessNotice.text}
                            </span>
                          )}
                        </td>

                        {/* Reward Tier */}
                        <td className="py-3 px-4">
                          <span className="text-zinc-300">{record.rewardTier || "Standard Physical Reward"}</span>
                        </td>

                        {/* Full Shipping Address */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="text-zinc-200">
                            {record.addressLine1}
                            {record.addressLine2 ? `, ${record.addressLine2}` : ""}
                          </div>
                          <div className="text-zinc-400 text-[11px]">
                            {record.city}
                            {record.state ? `, ${record.state}` : ""} {record.postalCode}, {record.country}
                          </div>
                          {record.notes && (
                            <div className="text-[10px] text-amber-300/80 italic mt-0.5">Note: {record.notes}</div>
                          )}
                        </td>

                        {/* Phone */}
                        <td className="py-3 px-4">
                          <span className="text-zinc-400">{record.phone || "—"}</span>
                        </td>

                        {/* Shipping Status */}
                        <td className="py-3 px-4">
                          <Badge className={`${STATUS_BADGE_STYLES[record.shippingStatus]} capitalize text-[10px]`}>
                            {record.shippingStatus}
                          </Badge>
                        </td>

                        {/* Tracking Number */}
                        <td className="py-3 px-4 font-mono text-[11px]">
                          {record.trackingNumber ? (
                            <span className="text-zinc-300 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                              {record.trackingNumber}
                            </span>
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Acceptance Criteria 3: Imported addresses editable per backer row */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleStartEdit(record)}
                              className="text-zinc-400 hover:text-purple-300 hover:bg-purple-950/30"
                              title="Edit backer shipping address"
                              aria-label={`Edit shipping address for ${record.recipientName}`}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleDeleteRow(record.id)}
                              className="text-zinc-500 hover:text-red-400 hover:bg-red-950/30"
                              title="Delete record"
                              aria-label={`Delete record for ${record.recipientName}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
