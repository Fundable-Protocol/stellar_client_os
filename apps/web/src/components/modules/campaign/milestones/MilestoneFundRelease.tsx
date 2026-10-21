"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Coins,
  FileCheck2,
  Send,
  ThumbsDown,
  ThumbsUp,
  AlertCircle,
  ExternalLink,
  Lock,
} from "lucide-react";
import type {
  MilestoneReleaseVotingSummary,
  MilestoneTranche,
} from "@/types/campaign-milestone-release";

interface MilestoneFundReleaseProps {
  campaignId: string;
  isCreator?: boolean;
  viewerAddress?: string;
  campaignStatus?: string;
}

export function MilestoneFundRelease({
  campaignId,
  isCreator = false,
  viewerAddress,
  campaignStatus,
}: MilestoneFundReleaseProps) {
  const [tranches, setTranches] = useState<MilestoneTranche[]>([]);
  const [summaries, setSummaries] = useState<Record<string, MilestoneReleaseVotingSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form states for submitting completion report
  const [activeReportMilestoneId, setActiveReportMilestoneId] = useState<string | null>(null);
  const [reportSummary, setReportSummary] = useState("");
  const [reportDeliverables, setReportDeliverables] = useState("");
  const [reportEvidenceUrl, setReportEvidenceUrl] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  // Voting state
  const [votingMilestoneId, setVotingMilestoneId] = useState<string | null>(null);
  const [voteComment, setVoteComment] = useState("");
  const [submittingVote, setSubmittingVote] = useState(false);

  // Release trigger state
  const [releasingMilestoneId, setReleasingMilestoneId] = useState<string | null>(null);

  // Live timer tick
  const [, setTick] = useState(0);

  const fetchTranches = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/milestone-release`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.tranches) {
        setTranches(data.tranches);
        const sumMap: Record<string, MilestoneReleaseVotingSummary> = {};
        for (const s of data.summaries || []) {
          sumMap[s.milestoneId] = s;
        }
        setSummaries(sumMap);
      }
    } catch (err: any) {
      console.error("Failed to load milestone tranches:", err);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void fetchTranches();
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchTranches]);

  const handleSubmitReport = async (milestoneId: string) => {
    if (!reportSummary.trim()) {
      setError("Please provide a milestone completion summary.");
      return;
    }
    setError(null);
    setActionSuccess(null);
    setSubmittingReport(true);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/milestone-release/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestoneId,
          creatorAddress: viewerAddress || "creator",
          summary: reportSummary.trim(),
          deliverables: reportDeliverables.trim(),
          evidenceUrls: reportEvidenceUrl.trim() ? [reportEvidenceUrl.trim()] : [],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit completion report.");
      }

      setActionSuccess("Completion report submitted! 72-hour backer voting window is open.");
      setActiveReportMilestoneId(null);
      setReportSummary("");
      setReportDeliverables("");
      setReportEvidenceUrl("");
      await fetchTranches();
    } catch (err: any) {
      setError(err.message || "Failed to submit report.");
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleCastVote = async (milestoneId: string, approve: boolean) => {
    if (!viewerAddress) {
      setError("Connect your wallet to vote as a verified backer.");
      return;
    }
    setError(null);
    setActionSuccess(null);
    setSubmittingVote(true);

    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/milestone-release/${milestoneId}/vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voterAddress: viewerAddress,
            approve,
            comment: voteComment.trim() || undefined,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to cast vote.");
      }

      setActionSuccess(
        approve
          ? "Approval vote cast successfully!"
          : "Rejection vote cast successfully."
      );
      setVotingMilestoneId(null);
      setVoteComment("");
      await fetchTranches();
    } catch (err: any) {
      setError(err.message || "Failed to cast vote.");
    } finally {
      setSubmittingVote(false);
    }
  };

  const handleTriggerRelease = async (milestoneId: string) => {
    setError(null);
    setActionSuccess(null);
    setReleasingMilestoneId(milestoneId);

    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/milestone-release/${milestoneId}/release`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callerAddress: viewerAddress,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "Failed to trigger fund release.");
      }

      setActionSuccess(data.message || "Tranche funds released successfully!");
      await fetchTranches();
    } catch (err: any) {
      setError(err.message || "Failed to release funds.");
    } finally {
      setReleasingMilestoneId(null);
    }
  };

  const formatCountdown = (votingEndsAt?: number) => {
    if (!votingEndsAt) return "00:00:00";
    const diff = Math.max(0, votingEndsAt - Date.now());
    if (diff <= 0) return "Voting Ended (Timeout Lapsed)";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `${hours.toString().padStart(2, "0")}h ${minutes
      .toString()
      .padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-center text-sm text-zinc-400">
        Loading milestone release tranches...
      </div>
    );
  }

  const isClosed =
    campaignStatus?.toUpperCase() === "COMPLETED" ||
    campaignStatus?.toUpperCase() === "FAILED" ||
    campaignStatus?.toUpperCase() === "CLAIMED" ||
    campaignStatus?.toUpperCase() === "CLOSED";

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <Coins className="h-5 w-5 text-emerald-400" />
              Milestone-Based Fund Release
            </h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
              Post-campaign funds are disbursed in tranches tied to completed milestones.
              The creator submits a completion report, verified backers have 72 hours to vote,
              and the tranche is released when the majority approves or the 72-hour window lapses.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                isClosed
                  ? "bg-emerald-950/60 border-emerald-700/60 text-emerald-300"
                  : "bg-amber-950/60 border-amber-700/60 text-amber-300"
              }`}
            >
              {isClosed ? "Campaign Closed — Tranche Payouts Open" : "Active Campaign — Pending Close"}
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {actionSuccess && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
        )}
      </div>

      {/* Tranches List */}
      <div className="space-y-4">
        {tranches.map((tranche, idx) => {
          const summary = summaries[tranche.id];
          const isPriorReleased = idx === 0 || tranches[idx - 1].status === "RELEASED";
          const canSubmitReport =
            isCreator && isPriorReleased && (tranche.status === "PENDING" || tranche.status === "REJECTED");
          const isVoting = tranche.status === "VOTING";
          const isReleased = tranche.status === "RELEASED";
          const isTimeout = summary?.isTimeoutLapsed;
          const canTriggerRelease = summary?.canRelease;

          const totalVotes = (tranche.votesFor || 0) + (tranche.votesAgainst || 0);
          const approvePct = totalVotes > 0 ? Math.round((tranche.votesFor / totalVotes) * 100) : 0;

          return (
            <div
              key={tranche.id}
              className={`rounded-xl border p-5 transition-all ${
                isReleased
                  ? "border-emerald-800/40 bg-emerald-950/10"
                  : isVoting
                  ? "border-blue-700/50 bg-blue-950/15"
                  : "border-zinc-800 bg-zinc-900/50"
              }`}
            >
              {/* Header row */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs ${
                      isReleased
                        ? "bg-emerald-600 text-white"
                        : isVoting
                        ? "bg-blue-600 text-white animate-pulse"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {isReleased ? <CheckCircle2 className="h-4 w-4" /> : tranche.milestoneNumber}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                      {tranche.title}
                      {!isPriorReleased && <Lock className="h-3.5 w-3.5 text-zinc-500" />}
                    </h4>
                    <p className="text-xs text-zinc-400">{tranche.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs font-bold text-zinc-200">
                      {tranche.targetAmount} XLM
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      Tranche {tranche.tranchePercentage}%
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`text-[11px] px-2.5 py-1 rounded-full font-semibold border ${
                      isReleased
                        ? "bg-emerald-950/60 border-emerald-700 text-emerald-300"
                        : isVoting
                        ? "bg-blue-950/60 border-blue-600 text-blue-300"
                        : tranche.status === "REJECTED"
                        ? "bg-rose-950/60 border-rose-700 text-rose-300"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400"
                    }`}
                  >
                    {isReleased
                      ? "Funds Released"
                      : isVoting
                      ? "Voting Active (72h)"
                      : tranche.status === "REJECTED"
                      ? "Report Rejected"
                      : "Pending Completion"}
                  </span>
                </div>
              </div>

              {/* Voting Window Countdown & Progress */}
              {isVoting && (
                <div className="mt-4 pt-4 border-t border-zinc-800/80 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-amber-300 font-mono">
                      <Clock className="h-4 w-4 text-amber-400" />
                      Voting Window: {formatCountdown(tranche.votingEndsAt)}
                    </div>
                    <div className="text-zinc-400">
                      Majority Consensus:{" "}
                      <strong className="text-zinc-200">{approvePct}% Approval</strong> ({tranche.votesFor} For / {tranche.votesAgainst} Against)
                    </div>
                  </div>

                  {/* Vote bar */}
                  <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden flex">
                    <div
                      className="bg-emerald-500 transition-all duration-300"
                      style={{ width: `${approvePct}%` }}
                    />
                    <div
                      className="bg-rose-500 transition-all duration-300"
                      style={{ width: `${100 - approvePct}%` }}
                    />
                  </div>

                  {/* Completion Report Display */}
                  {tranche.completionReport && (
                    <div className="rounded-lg bg-zinc-950/40 p-3 border border-zinc-800/60 text-xs space-y-1.5">
                      <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
                        <FileCheck2 className="h-3.5 w-3.5 text-blue-400" />
                        Creator Completion Report
                      </div>
                      <p className="text-zinc-300 italic">{tranche.completionReport.summary}</p>
                      {tranche.completionReport.deliverables && (
                        <div className="text-zinc-400">
                          Deliverables: <span className="text-zinc-300">{tranche.completionReport.deliverables}</span>
                        </div>
                      )}
                      {tranche.completionReport.evidenceUrls && tranche.completionReport.evidenceUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {tranche.completionReport.evidenceUrls.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 underline"
                            >
                              Proof #{i + 1} <ExternalLink className="h-3 w-3" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions (Vote / Release) */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    {/* Backer Voting Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCastVote(tranche.id, true)}
                        disabled={submittingVote || isTimeout}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" /> Approve Tranche
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCastVote(tranche.id, false)}
                        disabled={submittingVote || isTimeout}
                        className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" /> Reject
                      </button>
                    </div>

                    {/* Trigger Release Action */}
                    {canTriggerRelease && (
                      <button
                        type="button"
                        onClick={() => handleTriggerRelease(tranche.id)}
                        disabled={releasingMilestoneId === tranche.id}
                        className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Coins className="h-4 w-4" />
                        Trigger Fund Release ({summary?.isMajorityApproved ? "Majority Approved" : "72h Lapsed"})
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Released Info */}
              {isReleased && (
                <div className="mt-3 pt-3 border-t border-emerald-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-400/90">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>
                      Disbursed {tranche.releasedAmount} XLM via{" "}
                      {tranche.releaseReason === "majority_approval" ? "Backer Approval Vote" : "72-Hour Timeout Lapse"}
                    </span>
                  </div>
                  {tranche.releasedTxHash && (
                    <span className="font-mono text-[11px] text-zinc-500">
                      Tx: {tranche.releasedTxHash}
                    </span>
                  )}
                </div>
              )}

              {/* Creator: Submit Completion Report Form */}
              {canSubmitReport && (
                <div className="mt-3 pt-3 border-t border-zinc-800">
                  {activeReportMilestoneId === tranche.id ? (
                    <div className="space-y-3 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-zinc-200">
                          Submit Milestone {tranche.milestoneNumber} Completion Report
                        </h5>
                        <button
                          type="button"
                          onClick={() => setActiveReportMilestoneId(null)}
                          className="text-xs text-zinc-400 hover:text-zinc-200"
                        >
                          Cancel
                        </button>
                      </div>

                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1">
                          Completion Summary & Work Done *
                        </label>
                        <textarea
                          value={reportSummary}
                          onChange={(e) => setReportSummary(e.target.value)}
                          placeholder="Describe the deliverables achieved for this milestone..."
                          rows={3}
                          className="w-full text-xs rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">
                            Deliverables / Output (optional)
                          </label>
                          <input
                            type="text"
                            value={reportDeliverables}
                            onChange={(e) => setReportDeliverables(e.target.value)}
                            placeholder="e.g. 5,000 trees planted, nursery operational"
                            className="w-full text-xs rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">
                            Evidence / Photo Proof URL (optional)
                          </label>
                          <input
                            type="text"
                            value={reportEvidenceUrl}
                            onChange={(e) => setReportEvidenceUrl(e.target.value)}
                            placeholder="https://ipfs.io/ipfs/..."
                            className="w-full text-xs rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSubmitReport(tranche.id)}
                        disabled={submittingReport}
                        className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {submittingReport ? "Submitting..." : "Submit Report & Open 72h Backer Vote"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveReportMilestoneId(tranche.id)}
                      className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1.5"
                    >
                      <FileCheck2 className="h-4 w-4" /> Submit Milestone Completion Report
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
