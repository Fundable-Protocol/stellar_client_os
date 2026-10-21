"use client";

/**
 * Pre-launch waitlist capture for a campaign that has not launched yet.
 *
 * Collects an email address and reports the current waitlist size back to the
 * campaign page through `onCountChange`.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface CampaignWaitlistProps {
  campaignId: string;
  campaignTitle?: string;
  /** ISO date the campaign is expected to launch. */
  launchDate?: string;
  /** Called whenever the waitlist size changes. */
  onCountChange?: (count: number) => void;
  className?: string;
}

export function CampaignWaitlist({
  campaignId,
  campaignTitle,
  launchDate,
  onCountChange,
  className,
}: CampaignWaitlistProps) {
  const [email, setEmail] = useState("");
  const [count, setCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/waitlist`);
        const json = await res.json();
        if (cancelled || !res.ok) return;
        setCount(json.count ?? 0);
        onCountChange?.(json.count ?? 0);
      } catch {
        // The waitlist count is decorative; a failure must not break the page.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [campaignId, onCountChange]);

  const join = useCallback(async () => {
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), notifyOnLaunch: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not join the waitlist");
      setJoined(true);
      setCount(json.count ?? count + 1);
      onCountChange?.(json.count ?? count + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the waitlist");
    } finally {
      setSubmitting(false);
    }
  }, [campaignId, count, email, onCountChange]);

  return (
    <section
      aria-label="Campaign waitlist"
      className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 ${className ?? ""}`}
    >
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-amber-400" />
        <h2 className="text-base font-bold text-zinc-50">Join the waitlist</h2>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        {campaignTitle
          ? `Be the first to know when ${campaignTitle} goes live.`
          : "Be the first to know when this campaign goes live."}
        {launchDate ? ` Launching ${launchDate}.` : ""}
      </p>

      {joined ? (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" /> You&apos;re on the list — we&apos;ll notify
          you at launch.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            className="bg-zinc-950 border-zinc-800 text-zinc-100"
          />
          <Button
            type="button"
            onClick={() => void join()}
            disabled={submitting}
            className="bg-purple-600 text-white hover:bg-purple-500"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Notify me
          </Button>
        </div>
      )}

      {count > 0 && (
        <p className="mt-3 text-xs text-zinc-500">
          {count} {count === 1 ? "person has" : "people have"} already joined.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </section>
  );
}

export default CampaignWaitlist;
