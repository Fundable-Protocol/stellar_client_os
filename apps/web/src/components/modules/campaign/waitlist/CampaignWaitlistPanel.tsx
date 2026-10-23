"use client";

/**
 * Compact waitlist panel for a campaign that has not launched yet.
 *
 * A slimmed-down variant of {@link CampaignWaitlist} for pages that embed the
 * waitlist next to other content.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface CampaignWaitlistPanelProps {
  campaignId: string;
  className?: string;
}

export function CampaignWaitlistPanel({ campaignId, className }: CampaignWaitlistPanelProps) {
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
        if (!cancelled && res.ok) setCount(json.count ?? 0);
      } catch {
        // The count is decorative; ignore failures.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the waitlist");
    } finally {
      setSubmitting(false);
    }
  }, [campaignId, count, email]);

  return (
    <section
      aria-label="Campaign waitlist"
      className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 ${className ?? ""}`}
    >
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-bold text-zinc-100">Join the waitlist</h3>
        {count > 0 && (
          <span className="ml-auto text-xs text-zinc-500">
            {count} {count === 1 ? "person" : "people"}
          </span>
        )}
      </div>

      {joined ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> You&apos;re on the list.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
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
            size="sm"
            onClick={() => void join()}
            disabled={submitting}
            className="bg-purple-600 text-white hover:bg-purple-500"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Join"}
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </section>
  );
}

export default CampaignWaitlistPanel;
