"use client";

import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  X,
  Lightbulb,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  AccessibilityAuditResult,
  AccessibilityIssue,
  AccessibilitySeverity,
} from "@/services/campaign-accessibility.service";

export interface CampaignAccessibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  auditResult: AccessibilityAuditResult | null;
  onProceedPublish?: () => void;
  isPublishing?: boolean;
}

export function CampaignAccessibilityModal({
  isOpen,
  onClose,
  auditResult,
  onProceedPublish,
  isPublishing = false,
}: CampaignAccessibilityModalProps) {
  const [filter, setFilter] = useState<"all" | AccessibilitySeverity>("all");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !auditResult) return null;

  const { passed, canPublish, score, criticalIssues, warnings, allIssues } = auditResult;

  const displayedIssues = allIssues.filter((issue) => {
    if (filter === "all") return true;
    return issue.severity === filter;
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="accessibility-audit-title"
      aria-describedby="accessibility-audit-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                !canPublish
                  ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                  : warnings.length > 0
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              }`}
            >
              {!canPublish ? (
                <ShieldAlert className="h-6 w-6" />
              ) : (
                <ShieldCheck className="h-6 w-6" />
              )}
            </div>
            <div>
              <h2 id="accessibility-audit-title" className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                WCAG 2.1 AA Accessibility Audit
              </h2>
              <p id="accessibility-audit-description" className="text-xs text-zinc-400 mt-0.5">
                Automated accessibility check for your campaign page prior to publishing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close accessibility audit dialog"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status banner */}
        <div className="my-4 space-y-3">
          <div
            role="status"
            aria-live="polite"
            className={`rounded-xl p-4 border text-sm ${
              !canPublish
                ? "border-rose-800/60 bg-rose-950/40 text-rose-200"
                : warnings.length > 0
                ? "border-amber-800/60 bg-amber-950/40 text-amber-200"
                : "border-emerald-800/60 bg-emerald-950/40 text-emerald-200"
            }`}
          >
            <div className="flex items-center justify-between font-semibold">
              <span className="flex items-center gap-2">
                {!canPublish ? (
                  <>
                    <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
                    Publishing Blocked — Critical Issues Found
                  </>
                ) : warnings.length > 0 ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
                    Publishing Allowed — Warnings are Advisory
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    All WCAG 2.1 AA Checks Passed
                  </>
                )}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-200">
                Score: {score}/100
              </span>
            </div>
            <p className="mt-2 text-xs opacity-90 leading-relaxed">
              {!canPublish
                ? `There ${
                    criticalIssues.length === 1 ? "is 1 critical issue" : `are ${criticalIssues.length} critical issues`
                  } that must be resolved before this campaign page can be published. Warnings are advisory and do not block publishing.`
                : warnings.length > 0
                ? `No critical issues found. You can publish now, but reviewing the ${warnings.length} advisory suggestion(s) will make your campaign accessible to more backers.`
                : "Your campaign page meets WCAG 2.1 Level AA automated accessibility standards and is ready for launch."}
            </p>
          </div>

          {/* Filter Pills */}
          {allIssues.length > 0 && (
            <div className="flex items-center gap-2 text-xs" role="tablist" aria-label="Issue severity filters">
              <button
                type="button"
                role="tab"
                aria-selected={filter === "all"}
                onClick={() => setFilter("all")}
                className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  filter === "all"
                    ? "border-purple-500 bg-purple-600/20 text-purple-200"
                    : "border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                All Issues ({allIssues.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "critical"}
                onClick={() => setFilter("critical")}
                className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  filter === "critical"
                    ? "border-rose-500 bg-rose-600/20 text-rose-200"
                    : "border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Critical ({criticalIssues.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "warning"}
                onClick={() => setFilter("warning")}
                className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  filter === "warning"
                    ? "border-amber-500 bg-amber-600/20 text-amber-200"
                    : "border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Warnings ({warnings.length})
              </button>
            </div>
          )}
        </div>

        {/* Issue list scroll area */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1 min-h-[160px]">
          {displayedIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-400">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-2" />
              <p className="text-sm font-medium text-zinc-200">No issues found in this category</p>
              <p className="text-xs text-zinc-500 mt-1">Your content adheres to the evaluated WCAG rules.</p>
            </div>
          ) : (
            displayedIssues.map((issue) => (
              <div
                key={issue.id}
                className={`rounded-xl border p-4 space-y-2.5 transition-colors ${
                  issue.severity === "critical"
                    ? "border-rose-800/50 bg-rose-950/20"
                    : "border-amber-800/50 bg-amber-950/20"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={issue.severity === "critical" ? "destructive" : "outline"}
                        className={
                          issue.severity === "critical"
                            ? "bg-rose-600 text-white border-transparent"
                            : "border-amber-500 text-amber-400 bg-amber-950/40"
                        }
                      >
                        {issue.severity === "critical" ? "Critical — Blocks Publish" : "Warning — Advisory"}
                      </Badge>
                      <span className="text-[11px] font-mono text-zinc-400">
                        {issue.wcagCriterion}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-100 mt-1.5">{issue.title}</h3>
                  </div>
                  {issue.field && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono shrink-0">
                      Field: {issue.field}
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed">{issue.description}</p>

                {/* Fix Suggestion Box */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-200 flex items-start gap-2.5">
                  <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-semibold text-amber-300">Fix Suggestion: </span>
                    <span className="text-zinc-300">{issue.suggestion}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 border-t border-zinc-800 pt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800"
          >
            {!canPublish ? "Fix Issues in Form" : "Close"}
          </Button>

          {canPublish && onProceedPublish && (
            <Button
              type="button"
              onClick={() => {
                onClose();
                onProceedPublish();
              }}
              disabled={isPublishing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-900/30"
            >
              {isPublishing ? "Publishing..." : "Proceed with Publish"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
