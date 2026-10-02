"use client";

import { FormEvent, useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CampaignFollowProps {
  campaignId: string;
}

const storageKey = (campaignId: string) => `campaign-follow-email:${campaignId}`;

export function CampaignFollow({ campaignId }: CampaignFollowProps) {
  const [email, setEmail] = useState("");
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const savedEmail = window.localStorage.getItem(storageKey(campaignId));
    if (!savedEmail) return;
    setEmail(savedEmail);
    void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/follow?email=${encodeURIComponent(savedEmail)}`)
      .then((response) => response.json())
      .then((data: { following?: boolean; followerCount?: number }) => {
        setFollowing(Boolean(data.following));
        if (typeof data.followerCount === "number") setFollowerCount(data.followerCount);
      })
      .catch(() => undefined);
  }, [campaignId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = following
        ? await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/follow?email=${encodeURIComponent(email)}`, { method: "DELETE" })
        : await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/follow`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
      const data = (await response.json()) as { error?: string; following?: boolean };
      if (!response.ok) throw new Error(data.error ?? "Unable to update campaign follow");
      setFollowing(Boolean(data.following));
      if (data.following) {
        window.localStorage.setItem(storageKey(campaignId), email.trim().toLowerCase());
        setMessage("You’ll receive campaign progress updates at this email.");
      } else {
        window.localStorage.removeItem(storageKey(campaignId));
        setMessage("Campaign updates unsubscribed.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update campaign follow");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-indigo-800/50 bg-indigo-950/20 p-4 space-y-3" data-testid="campaign-follow">
      <div className="flex items-start gap-3">
        {following ? <Bell className="mt-0.5 h-4 w-4 text-indigo-300" /> : <BellOff className="mt-0.5 h-4 w-4 text-zinc-400" />}
        <div>
          <p className="text-sm font-semibold text-zinc-100">Follow this campaign</p>
          <p className="text-xs text-zinc-400">Get progress updates without sponsoring. You can unsubscribe anytime.</p>
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`follow-email-${campaignId}`} className="sr-only">Email address</label>
        <input
          id={`follow-email-${campaignId}`}
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          disabled={loading}
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <Button type="submit" size="sm" disabled={loading} className="bg-indigo-600 text-white hover:bg-indigo-700">
          {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {following ? "Unfollow" : "Follow"}
        </Button>
      </form>
      <div className="flex items-center justify-between text-xs text-zinc-500" aria-live="polite">
        <span>{message ?? "We’ll only use your email for this campaign’s updates."}</span>
        {followerCount !== null && <span>{followerCount.toLocaleString()} followers</span>}
      </div>
    </div>
  );
}
