"use client";

import React, { useState, useEffect } from "react";
import {
  Bell,
  CheckCircle2,
  Users,
  Flame,
  ArrowRight,
  Loader2,
  Mail,
  Shield,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface PreLaunchWaitlistCardProps {
  campaignId: string;
  campaignName: string;
  initialFollowerCount?: number;
  targetFollowers?: number;
  className?: string;
}

export function PreLaunchWaitlistCard({
  campaignId,
  campaignName,
  initialFollowerCount = 42,
  targetFollowers = 100,
  className = "",
}: PreLaunchWaitlistCardProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [targetCount, setTargetCount] = useState(targetFollowers);
  const [error, setError] = useState<string | null>(null);

  // Fetch real-time waitlist stats on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      try {
        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/waitlist`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json.data) {
            setFollowerCount(Math.max(json.data.subscriberCount, initialFollowerCount));
            if (json.data.targetSubscribers) setTargetCount(json.data.targetSubscribers);
          }
        }
      } catch {
        // Best-effort
      }
    }
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [campaignId, initialFollowerCount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to join waitlist");
      }

      setIsSubscribed(true);
      setFollowerCount((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressPercent = Math.min(Math.round((followerCount / targetCount) * 100), 100);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-b from-purple-950/40 via-zinc-900/90 to-zinc-950 p-6 sm:p-8 shadow-2xl backdrop-blur-xl ${className}`}
      data-testid="prelaunch-waitlist-card"
    >
      {/* Decorative Glow */}
      <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-purple-600/20 blur-3xl pointer-events-none" />
      <div className="absolute -left-20 -bottom-20 h-48 w-48 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Top Badges */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge className="bg-purple-600/20 text-purple-300 border-purple-500/40 px-3 py-1 font-semibold text-xs tracking-wider uppercase">
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-purple-400" />
            Coming Soon • Day-One Access
          </Badge>

          {/* Real-time Follower Counter Pill */}
          <div className="flex items-center gap-1.5 rounded-full border border-purple-700/50 bg-purple-950/60 px-3.5 py-1 text-xs font-semibold text-purple-200 shadow-inner">
            <Flame className="h-4 w-4 text-amber-400 animate-bounce" />
            <span>{followerCount.toLocaleString()} Waiting to Back</span>
          </div>
        </div>

        {/* Title and Pitch */}
        <div>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Be the First to Know When We Go Live
          </h3>
          <p className="mt-2 text-sm sm:text-base text-zinc-300 leading-relaxed">
            Join the early backer waitlist for <strong className="text-purple-300">{campaignName}</strong>. You’ll receive an instant email and push alert the second pledges open, giving you exclusive access to limited-supply early bird reward tiers.
          </p>
        </div>

        {/* Social Proof Progress Bar */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-300 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-purple-400" />
              Community Momentum
            </span>
            <span className="font-semibold text-purple-300">
              {followerCount} of {targetCount} early supporters goal ({progressPercent}%)
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-zinc-400">
            🔥 Rapid growth: High day-one interest triggers automated first-10% matching grant consideration.
          </p>
        </div>

        {/* Subscription Form */}
        {isSubscribed ? (
          <div className="rounded-xl border border-emerald-700/50 bg-emerald-950/30 p-5 text-center shadow-lg">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h4 className="text-lg font-bold text-white">You&apos;re On the VIP Waitlist!</h4>
            <p className="mt-1 text-xs text-zinc-300">
              We&apos;ve reserved your early-access spot. We&apos;ll notify you at <strong className="text-emerald-300">{email}</strong> the second the campaign transitions to active.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  type="email"
                  required
                  placeholder="Enter your email for day-one launch notification"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  className="h-12 pl-10 border-zinc-700 bg-zinc-900/90 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 text-sm"
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-12 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 px-6 font-semibold text-white shadow-lg shadow-purple-900/40 hover:from-purple-500 hover:to-blue-500 shrink-0"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Reserving Spot...
                  </>
                ) : (
                  <>
                    <Bell className="mr-2 h-4 w-4" />
                    Notify Me on Launch
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            {error && (
              <p className="text-xs text-rose-400 font-medium">{error}</p>
            )}

            <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3 text-zinc-400" />
                No spam. Unsubscribe anytime with 1-click.
              </span>
              <span>Zero cost to follow</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
