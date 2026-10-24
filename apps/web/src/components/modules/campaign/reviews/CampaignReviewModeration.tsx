"use client";

import { useCallback, useEffect, useState } from "react";
import { StarRating } from "@/components/ui/star-rating";
import type { CampaignReview } from "@/services/campaign-reviews.service";

export function CampaignReviewModeration({
  campaignId,
  creatorAddress,
}: {
  campaignId: string;
  creatorAddress: string;
}) {
  const [reviews, setReviews] = useState<CampaignReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/reviews?creator=${encodeURIComponent(creatorAddress)}`,
      );
      const body = (await response.json()) as { reviews?: CampaignReview[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not load testimonials.");
      setReviews(body.reviews ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load testimonials.");
    } finally {
      setLoading(false);
    }
  }, [campaignId, creatorAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  const moderate = async (reviewId: string, action: "approve" | "reject" | "feature" | "unfeature") => {
    setSavingId(reviewId);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/reviews`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorAddress, reviewId, action }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not update testimonial.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update testimonial.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section aria-label="Manage backer testimonials" className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
      <h3 className="text-lg font-bold text-zinc-100">Review backer testimonials</h3>
      <p className="mt-1 text-sm text-zinc-400">Approve testimonials before they appear publicly, then feature your favorites.</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}
      {loading ? (
        <p className="mt-4 text-sm text-zinc-400">Loading testimonials…</p>
      ) : reviews.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No testimonials have been submitted yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-zinc-300">{review.backerAddress}</span>
                <span className="flex items-center gap-2">
                  <StarRating value={review.rating} />
                  <span className="text-xs text-zinc-400">{review.status.toLowerCase()}</span>
                </span>
              </div>
              {review.reviewText && <p className="mt-2 text-sm text-zinc-300">{review.reviewText}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {review.status === "PENDING" && (
                  <>
                    <button type="button" disabled={savingId === review.id} onClick={() => void moderate(review.id, "approve")} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Approve</button>
                    <button type="button" disabled={savingId === review.id} onClick={() => void moderate(review.id, "reject")} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 disabled:opacity-50">Reject</button>
                  </>
                )}
                {review.status === "APPROVED" && (
                  <button type="button" disabled={savingId === review.id} onClick={() => void moderate(review.id, review.featured ? "unfeature" : "feature")} className="rounded-md border border-amber-700 px-3 py-1.5 text-xs font-semibold text-amber-200 disabled:opacity-50">
                    {review.featured ? "Remove feature" : "Feature on campaign"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
