"use client";

import React, { useEffect, useState } from "react";
import {
  FileText,
  Calendar,
  CheckCircle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  PlusCircle,
  Check,
  X,
  FileDown,
} from "lucide-react";
import { ComplianceDocument } from "@/types/campaign-compliance";
import { CampaignComplianceSettingsModal } from "./CampaignComplianceSettingsModal";

interface CampaignComplianceDocumentsListProps {
  campaignId: string;
  creatorAddress?: string;
  canManage?: boolean; // Whether the creator or manager is viewing
  initialDocuments?: ComplianceDocument[];
  isAdmin?: boolean; // Whether viewing user has platform admin privileges
  currentAdminAddress?: string;
}

export const CampaignComplianceDocumentsList: React.FC<CampaignComplianceDocumentsListProps> = ({
  campaignId,
  creatorAddress = "",
  canManage = false,
  initialDocuments,
  isAdmin = false,
  currentAdminAddress = "GADMIN_PLATFORM_VERIFIER",
}) => {
  const [documents, setDocuments] = useState<ComplianceDocument[]>(initialDocuments || []);
  const [loading, setLoading] = useState(!initialDocuments);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [verifyingDocId, setVerifyingDocId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/compliance-documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch {
      // fallback to current state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialDocuments) {
      fetchDocuments();
    }
  }, [campaignId]);

  const handleVerifyToggle = async (documentId: string, currentStatus: boolean) => {
    setVerifyingDocId(documentId);
    setActionError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/compliance-documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          adminAddress: currentAdminAddress,
          verified: !currentStatus,
          notes: !currentStatus ? "Verified by platform admin" : "Verification retracted",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update verification status");
      }

      const updated = await res.json();
      setDocuments((prev) =>
        prev.map((d) => (d.id === documentId ? updated.document : d))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Verification action failed";
      setActionError(msg);
    } finally {
      setVerifyingDocId(null);
    }
  };

  const getDocTypeBadge = (type: string) => {
    switch (type) {
      case "business_registration":
        return <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400 border border-blue-500/20">Business Registration</span>;
      case "non_profit_status":
        return <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">Non-Profit Status</span>;
      case "certification":
        return <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20">Certification</span>;
      default:
        return <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400 border border-zinc-700">Official Document</span>;
    }
  };

  return (
    <section aria-labelledby="compliance-docs-heading" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-fundable-purple-2" />
            <h2 id="compliance-docs-heading" className="text-xl font-bold text-zinc-950 dark:text-white">
              Compliance & Legal Due Diligence
            </h2>
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Verified compliance documents including business registration, non-profit status, and certifications for backer due diligence.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-fundable-purple-2 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition self-start sm:self-auto"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Upload Compliance Document
          </button>
        )}
      </div>

      {actionError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-xs text-zinc-500">
          Loading compliance documents...
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-zinc-400 mb-2" />
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            No compliance documents uploaded yet
          </p>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            {canManage
              ? "Attach your business registration or non-profit certifications in campaign settings to build credibility with prospective backers."
              : "The campaign creator has not yet attached any compliance documents."}
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
            >
              <PlusCircle className="h-3.5 w-3.5 text-fundable-purple-2" />
              Attach Documents in Settings
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {documents.map((doc) => (
            <article
              key={doc.id}
              className="flex flex-col justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 shadow-sm hover:border-fundable-purple-2/40 transition"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-fundable-purple-2 shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                        {doc.name}
                      </h3>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                        {doc.fileName}
                      </p>
                    </div>
                  </div>
                  {getDocTypeBadge(doc.documentType)}
                </div>

                {doc.notes && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 italic bg-zinc-50 dark:bg-zinc-900/60 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800/80">
                    &ldquo;{doc.notes}&rdquo;
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 pt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Uploaded {new Date(doc.uploadedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span>{(doc.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 dark:border-zinc-800/80 pt-3">
                <div className="flex items-center gap-1.5">
                  {doc.verified ? (
                    <span
                      title={`Verified by platform admin ${doc.verifiedBy || ""}`}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    >
                      <CheckCircle className="h-3 w-3 text-emerald-500" />
                      Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      <Clock className="h-3 w-3 text-amber-500" />
                      Pending Review
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Platform Admin Verify Toggle */}
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={verifyingDocId === doc.id}
                      onClick={() => handleVerifyToggle(doc.id, doc.verified)}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                        doc.verified
                          ? "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                      }`}
                    >
                      {doc.verified ? (
                        <>
                          <X className="h-3 w-3" /> Revoke
                        </>
                      ) : (
                        <>
                          <Check className="h-3 w-3" /> Mark Verified
                        </>
                      )}
                    </button>
                  )}

                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={doc.fileName}
                    className="inline-flex items-center gap-1 text-xs font-medium text-fundable-purple-2 hover:underline"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    View PDF
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Campaign Settings Modal for Document Upload */}
      <CampaignComplianceSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        campaignId={campaignId}
        creatorAddress={creatorAddress}
        onDocumentUploaded={(newDoc) => {
          setDocuments((prev) => [newDoc, ...prev]);
        }}
      />
    </section>
  );
};
