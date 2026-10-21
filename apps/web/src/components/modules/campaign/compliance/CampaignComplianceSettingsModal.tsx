"use client";

import React, { useState } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, FileText, X } from "lucide-react";
import {
  ComplianceDocument,
  ComplianceDocumentType,
  MAX_COMPLIANCE_FILE_SIZE,
} from "@/types/campaign-compliance";

interface CampaignComplianceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  creatorAddress: string;
  onDocumentUploaded?: (doc: ComplianceDocument) => void;
}

export const CampaignComplianceSettingsModal: React.FC<CampaignComplianceSettingsModalProps> = ({
  isOpen,
  onClose,
  campaignId,
  creatorAddress,
  onDocumentUploaded,
}) => {
  const [docName, setDocName] = useState("");
  const [documentType, setDocumentType] = useState<ComplianceDocumentType>("business_registration");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setUploadSuccess(false);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are allowed (.pdf)");
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_COMPLIANCE_FILE_SIZE) {
      setError("File exceeds maximum allowed size of 10 MB");
      setSelectedFile(null);
      return;
    }

    if (file.size <= 0) {
      setError("File cannot be empty");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    if (!docName) {
      // Auto-populate document name from file name without extension
      setDocName(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError("Please select a PDF document to upload.");
      return;
    }

    if (!docName.trim()) {
      setError("Document display name is required.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Convert file to base64 data URL for self-contained transmission
      const reader = new FileReader();
      const fileDataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(selectedFile);
      });

      const response = await fetch(`/api/campaigns/${campaignId}/compliance-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: docName.trim(),
          fileName: selectedFile.name,
          fileUrl: fileDataUrl,
          fileSize: selectedFile.size,
          mimeType: "application/pdf",
          documentType,
          uploadedBy: creatorAddress,
          notes: notes.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to upload compliance document");
      }

      const data = await response.json();
      setUploadSuccess(true);
      if (onDocumentUploaded) {
        onDocumentUploaded(data.document);
      }

      // Reset form
      setDocName("");
      setSelectedFile(null);
      setNotes("");
      setTimeout(() => {
        setUploadSuccess(false);
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred during upload";
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compliance-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl text-zinc-100 space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div>
            <h2 id="compliance-modal-title" className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-400" />
              Campaign Settings: Compliance Documents
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Attach business registration, non-profit status, or certifications for backer due diligence.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close compliance upload modal"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {uploadSuccess ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center space-y-2">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <h3 className="text-sm font-semibold text-emerald-300">Compliance Document Uploaded</h3>
            <p className="text-xs text-emerald-400/80">
              The document is now attached to your campaign and visible to backers.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="compliance-doc-name" className="block text-xs font-medium text-zinc-300 mb-1">
                Document Name / Title *
              </label>
              <input
                id="compliance-doc-name"
                type="text"
                required
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="e.g. Certificate of Incorporation / 501(c)(3) Status"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div>
              <label htmlFor="compliance-doc-type" className="block text-xs font-medium text-zinc-300 mb-1">
                Document Classification
              </label>
              <select
                id="compliance-doc-type"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as ComplianceDocumentType)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="business_registration">Business Registration</option>
                <option value="non_profit_status">Non-Profit Status (e.g. 501(c)(3))</option>
                <option value="certification">Environmental / Forestry Certification</option>
                <option value="other">Other Official Compliance Document</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                PDF File (Max 10 MB) *
              </label>
              <div className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 p-6 hover:border-purple-500/60 transition cursor-pointer">
                <input
                  id="compliance-file-input"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <UploadCloud className="h-8 w-8 text-zinc-400 mb-2" />
                <p className="text-xs font-medium text-zinc-200">
                  {selectedFile ? selectedFile.name : "Click to select or drag and drop PDF"}
                </p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {selectedFile
                    ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB • PDF`
                    : "PDF files up to 10 MB supported"}
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="compliance-notes" className="block text-xs font-medium text-zinc-300 mb-1">
                Additional Notes / Details (Optional)
              </label>
              <textarea
                id="compliance-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Registration agency, registration number, or issuance notes..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={onClose}
                disabled={isUploading}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploading || !selectedFile}
                className="rounded-lg bg-purple-600 px-5 py-2 text-xs font-semibold text-white hover:bg-purple-500 transition disabled:opacity-50"
              >
                {isUploading ? "Uploading..." : "Attach Document"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
