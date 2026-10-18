"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/providers/StellarWalletProvider";

interface RefundRequest {
  id: string;
  backerAddress: string;
  amount: string;
  token: string;
  requestReason: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
  requestedAt: number;
  reviewReason?: string;
  processingDueAt?: number;
}

export function CampaignRefundQueue({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const { address, isConnected, openModal } = useWallet();
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) return;
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(campaignId)}/refund-requests?walletAddress=${encodeURIComponent(address)}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as { requests?: RefundRequest[]; role?: string; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load the refund queue.");
    if (data.role !== "creator" && data.role !== "admin") {
      throw new Error("This wallet does not have permission to review refund requests.");
    }
    if (!data.requests) throw new Error("This wallet does not have permission to review refund requests.");
    setRequests(data.requests);
  }, [address, campaignId]);

  useEffect(() => {
    refresh().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Could not load the refund queue.");
    });
  }, [refresh]);

  const review = async (requestId: string, decision: "APPROVE" | "DECLINE") => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/refund-requests`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId,
          reviewerAddress: address,
          decision,
          reason: reviewReasons[requestId] ?? "",
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not review refund request.");
      setReviewReasons((current) => ({ ...current, [requestId]: "" }));
      await refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not review refund request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-6 py-10">
      <Link href={`/campaigns/${encodeURIComponent(campaignId)}`} className="text-sm text-fundable-purple-2 hover:underline">
        Back to {campaignName}
      </Link>
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">Refund management</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Review each backer’s reason and include a decision reason. Approved requests are due for on-chain processing within 24 hours.
        </p>
        {!isConnected || !address ? (
          <button type="button" onClick={openModal} className="mt-5 rounded-md bg-fundable-purple-2 px-4 py-2 text-sm font-medium text-white">
            Connect creator or admin wallet
          </button>
        ) : error ? (
          <p role="alert" className="mt-5 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : requests.length === 0 ? (
          <p className="mt-5 text-sm text-zinc-500">No refund requests have been submitted.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {requests.map((request) => (
              <li key={request.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{request.amount} {request.token}</strong>
                  <span className="text-sm">{request.status}</span>
                </div>
                <p className="mt-2 break-all text-xs text-zinc-500">Backer: {request.backerAddress}</p>
                <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{request.requestReason}</p>
                <p className="mt-1 text-xs text-zinc-500">Submitted {new Date(request.requestedAt).toLocaleString()}</p>
                {request.status === "PENDING" ? (
                  <>
                    <label className="mt-4 block text-sm text-zinc-700 dark:text-zinc-300">
                      Decision reason
                      <textarea
                        value={reviewReasons[request.id] ?? ""}
                        onChange={(event) => setReviewReasons((current) => ({ ...current, [request.id]: event.target.value }))}
                        maxLength={1000}
                        rows={2}
                        className="mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
                        placeholder="Required for approval or decline"
                      />
                    </label>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => review(request.id, "APPROVE")}
                        disabled={loading || !reviewReasons[request.id]?.trim()}
                        className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => review(request.id, "DECLINE")}
                        disabled={loading || !reviewReasons[request.id]?.trim()}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-700 disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-zinc-500">
                    Decision: {request.reviewReason}
                    {request.processingDueAt && (
                      <> · On-chain processing due by {new Date(request.processingDueAt).toLocaleString()}</>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
