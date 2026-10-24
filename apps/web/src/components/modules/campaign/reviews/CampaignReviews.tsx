"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareQuote } from "lucide-react";
import { StarRating, StarRatingInput } from "@/components/ui/star-rating";
import type { CampaignReview, RatingSummary, ReviewEligibility } from "@/services/campaign-reviews.service";

const ELIGIBILITY_MESSAGES: Record<string, string> = {
  campaign_not_found: "Testimonials are unavailable for this campaign.",
  not_a_backer: "Only campaign backers can leave a testimonial.",
  already_reviewed: "Thanks! You have already reviewed this campaign.",
};

/**
 * Campaign testimonial & star review panel (issue #1250).
 *
 * Lists creator-approved reviews and lets a campaign backer submit a rating
 * and short testimonial for creator approval.
 */
export function CampaignReviews({
  campaignId,
  viewerAddress,
}: {
  campaignId: string;
  viewerAddress?: string;
}) {
  const [reviews, setReviews] = useState<CampaignReview[]>([]);
  const [summary, setSummary] = useState<RatingSummary>({ averageRating: null, reviewCount: 0 });
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    const query = viewerAddress ? `?viewer=${encodeURIComponent(viewerAddress)}` : "";
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/reviews${query}`);
      const body = (await response.json()) as {
        reviews?: CampaignReview[];
        summary?: RatingSummary;
        eligibility?: ReviewEligibility | null;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Could not load campaign testimonials.");
      setReviews(body.reviews ?? []);
      setSummary(body.summary ?? { averageRating: null, reviewCount: 0 });
      setEligibility(body.eligibility ?? null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load campaign testimonials.");
    }
  }, [campaignId, viewerAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (rating < 1) {
      setError("Pick a star rating before submitting.");
      return;
    }
    if (!text.trim()) {
      setError("Add a short testimonial before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backerAddress: viewerAddress, rating, reviewText: text || undefined }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not submit your review.");
        return;
      }
      setSubmitted(true);
      setText("");
      setRating(0);
      await load();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-5" aria-label="Campaign reviews">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
          <MessageSquareQuote className="h-5 w-5 text-amber-400" /> Backer Reviews
        </h3>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <StarRating value={summary.averageRating} />
          {summary.averageRating === null ? "No reviews yet" : `${summary.averageRating} · ${summary.reviewCount} review${summary.reviewCount === 1 ? "" : "s"}`}
        </div>
      </header>
      {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}

      {/* Submission form when the viewer is an eligible rewarded backer */}
      {eligibility?.eligible && !submitted && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <p className="text-xs font-semibold text-zinc-400">Leave a testimonial for the creator to review</p>
          <StarRatingInput value={rating} onChange={setRating} />
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={280}
            required
            rows={3}
            placeholder="Share a short testimonial about your experience…"
            aria-label="Testimonial (280 characters maximum)"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-600"
          />
          <p className="text-right text-xs text-zinc-500">{text.length}/280</p>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit review"}
          </button>
        </form>
      )}
      {!eligibility?.eligible && eligibility && (
        <p className="text-xs text-zinc-500">{ELIGIBILITY_MESSAGES[eligibility.reason] ?? ""}</p>
      )}
      {submitted && <p className="text-xs text-emerald-400 font-semibold">Thanks! Your testimonial is waiting for creator approval.</p>}

      {/* Review list */}
      {reviews.length > 0 ? (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-300">{review.backerAddress}</span>
                <span className="flex items-center gap-2">
                  {review.featured && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">Featured</span>}
                  <StarRating value={review.rating} />
                </span>
              </div>
              {review.reviewText && <p className="text-sm text-zinc-300 leading-relaxed">{review.reviewText}</p>}
              <p className="text-[11px] text-zinc-500">{new Date(review.createdAt).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">No approved testimonials yet.</p>
      )}
    </section>
  );
}
