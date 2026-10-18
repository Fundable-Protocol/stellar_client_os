"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/providers/StellarWalletProvider";

interface Contribution {
  id: string;
  amount: string;
  token: string;
  contributedAt: number;
}

interface RefundRequest {
  id: string;
  contributionId: string;
  amount: string;
  token: string;
  requestReason: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
  requestedAt: number;
  reviewReason?: string;
  processingDueAt?: number;
}

interface RefundResponse {
  contributions?: Contribution[];
  requests: RefundRequest[];
  error?: string;
}

export function CampaignRefundPanel({
  campaignId,
  creatorAddress,
  closeAt,
}: {
  campaignId: string;
  creatorAddress: string;
  closeAt?: number;
}) {
  const { address, isConnected, openModal } = useWallet();
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [selectedContribution, setSelectedContribution] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isReviewer = Boolean(address && address.toLowerCase() === creatorAddress.toLowerCase());
  const canRequest = closeAt !== undefined && Date.now() < closeAt - 48 * 60 * 60 * 1000;

  const refresh = useCallback(async () => {
    if (!address) return;
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(campaignId)}/refund-requests?walletAddress=${encodeURIComponent(address)}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as RefundResponse;
    if (!response.ok) throw new Error(data.error ?? "Could not load refund requests.");
    setContributions(data.contributions ?? []);
    setRequests(data.requests);
  }, [address, campaignId]);

  useEffect(() => {
    refresh().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Could not load refund requests.");
    });
  }, [refresh]);

  const submitRequest = async () => {
    if (!address || !selectedContribution || !reason.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/refund-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contributionId: selectedContribution,
          backerAddress: address,
          reason,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not submit refund request.");
      setReason("");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not submit refund request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-950 dark:text-white">Refund requests</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Submit a request at least 48 hours before the campaign closes. Approved refunds are due for on-chain processing within 24 hours.
          </p>
        </div>
        <Link
          href={`/campaigns/${encodeURIComponent(campaignId)}/refund-requests`}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Manage requests
        </Link>
      </div>

      {!isConnected || !address ? (
        <button type="button" onClick={openModal} className="mt-5 rounded-md bg-fundable-purple-2 px-4 py-2 text-sm font-medium text-white">
          Connect wallet to request a refund
        </button>
      ) : isReviewer ? (
        <p className="mt-5 text-sm text-zinc-600 dark:text-zinc-300">You are the campaign creator. Use the management queue to review requests.</p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Contribution
            <select
              value={selectedContribution}
              onChange={(event) => setSelectedContribution(event.target.value)}
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
              disabled={!canRequest || contributions.length === 0}
            >
              <option value="">Select a contribution</option>
              {contributions.map((contribution) => (
                <option key={contribution.id} value={contribution.id}>
                  {contribution.amount} {contribution.token} · {new Date(contribution.contributedAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Reason for requesting a refund
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
              placeholder="Explain why you are requesting a refund"
              disabled={!canRequest}
            />
          </label>
          <button
            type="button"
            onClick={submitRequest}
            disabled={loading || !canRequest || !selectedContribution || !reason.trim()}
            className="rounded-md bg-fundable-purple-2 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Submitting…" : "Request refund"}
          </button>
        </div>
      )}

      {!canRequest && !isReviewer && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
          {closeAt === undefined ? "A closing date is not available for this campaign." : "The 48-hour refund request window has closed."}
        </p>
      )}
      {contributions.length === 0 && address && !isReviewer && (
        <p className="mt-3 text-sm text-zinc-500">No contributions from this wallet are available for a refund request.</p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {requests.length > 0 && (
        <ul className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
          {requests.map((request) => (
            <li key={request.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
              <span>{request.amount} {request.token} · {request.requestReason}</span>
              <span className="font-medium">{request.status}</span>
              {request.reviewReason && <span className="basis-full text-zinc-500">Review: {request.reviewReason}</span>}
              {request.processingDueAt && (
                <span className="basis-full text-zinc-500">
                  On-chain processing due by {new Date(request.processingDueAt).toLocaleString()}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
