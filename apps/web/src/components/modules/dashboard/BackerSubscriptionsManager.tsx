"use client";

import React, { useState } from "react";
import { useWallet } from "@/providers/StellarWalletProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RecurringContributionSubscription,
  RecurringSubscriptionStatus,
} from "@/types/recurring-contributions";
import {
  Calendar,
  DollarSign,
  PauseCircle,
  PlayCircle,
  XCircle,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import toast from "react-hot-toast";

export const BackerSubscriptionsManager: React.FC = () => {
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const effectiveAddress = address || "GBACKER1";

  const { data, isLoading, isError } = useQuery<{ subscriptions: RecurringContributionSubscription[] }>({
    queryKey: ["backer-subscriptions", effectiveAddress],
    queryFn: async () => {
      const res = await fetch(`/api/backer/subscriptions?backerAddress=${effectiveAddress}`);
      if (!res.ok) throw new Error("Failed to load recurring subscriptions");
      return res.json();
    },
    enabled: !!effectiveAddress,
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      cancellationReason,
    }: {
      id: string;
      status: RecurringSubscriptionStatus;
      cancellationReason?: string;
    }) => {
      const res = await fetch(`/api/backer/subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, cancellationReason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update subscription");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["backer-subscriptions", effectiveAddress] });
      if (variables.status === "PAUSED") {
        toast.success("Subscription paused");
      } else if (variables.status === "ACTIVE") {
        toast.success("Subscription resumed");
      } else if (variables.status === "CANCELLED") {
        toast.success("Subscription cancelled");
        setCancellingId(null);
        setCancelReason("");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const subscriptions = data?.subscriptions || [];

  const handlePause = (id: string) => {
    updateMutation.mutate({ id, status: "PAUSED" });
  };

  const handleResume = (id: string) => {
    updateMutation.mutate({ id, status: "ACTIVE" });
  };

  const handleConfirmCancel = (id: string) => {
    updateMutation.mutate({ id, status: "CANCELLED", cancellationReason: cancelReason || undefined });
  };

  return (
    <div
      data-testid="backer-subscriptions-manager"
      className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-8 space-y-6"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">
              Recurring Monthly Contributions
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Manage your ongoing monthly contributions and active subscriptions to creators.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl bg-zinc-800" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-rose-400 text-sm py-4">
          <AlertCircle className="w-4 h-4" />
          <span>Failed to load your recurring contributions. Please try again.</span>
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="text-center py-8 text-zinc-400 text-sm border border-dashed border-zinc-800 rounded-xl">
          <Calendar className="w-8 h-8 mx-auto mb-2 text-zinc-500 opacity-60" />
          <p>You do not have any recurring monthly contributions yet.</p>
          <p className="text-xs text-zinc-500 mt-1">
            Opt into monthly recurring support at checkout on any campaign page.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {subscriptions.map((sub) => {
            const isPaused = sub.status === "PAUSED";
            const isCancelled = sub.status === "CANCELLED";
            const isActive = sub.status === "ACTIVE";

            return (
              <div
                key={sub.id}
                data-testid={`subscription-item-${sub.id}`}
                className="bg-zinc-800/40 border border-zinc-800 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:border-zinc-700"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white text-base">
                      {sub.campaignTitle || `Campaign #${sub.campaignId}`}
                    </span>
                    <Badge
                      variant={
                        isActive ? "default" : isPaused ? "outline" : "destructive"
                      }
                      className={
                        isActive
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          : isPaused
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                          : "bg-zinc-800 text-zinc-400 border-zinc-700"
                      }
                    >
                      {sub.status}
                    </Badge>
                    <span className="text-xs text-zinc-400 font-mono">Monthly</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <div className="flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-white font-medium">
                        {sub.amount} {sub.token}/month
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-zinc-500" />
                      <span>
                        {isActive
                          ? `Next charge: ${new Date(sub.nextChargeAt).toLocaleDateString()}`
                          : isPaused
                          ? "Paused"
                          : "Cancelled"}
                      </span>
                    </div>

                    <div>
                      <span>
                        Total Contributed: {sub.totalChargedAmount} {sub.token} ({sub.successfulCyclesCount} {sub.successfulCyclesCount === 1 ? "cycle" : "cycles"})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
                  {isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`pause-btn-${sub.id}`}
                      disabled={updateMutation.isPending}
                      onClick={() => handlePause(sub.id)}
                      className="border-zinc-700 hover:border-zinc-600 text-zinc-300 text-xs gap-1.5"
                    >
                      <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                      Pause
                    </Button>
                  )}

                  {isPaused && (
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`resume-btn-${sub.id}`}
                      disabled={updateMutation.isPending}
                      onClick={() => handleResume(sub.id)}
                      className="border-zinc-700 hover:border-zinc-600 text-zinc-300 text-xs gap-1.5"
                    >
                      <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                      Resume
                    </Button>
                  )}

                  {!isCancelled && (
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid={`cancel-btn-${sub.id}`}
                      disabled={updateMutation.isPending}
                      onClick={() => setCancellingId(sub.id)}
                      className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancel
                    </Button>
                  )}

                  <a
                    href={`/campaigns/${sub.campaignId}`}
                    className="p-2 text-zinc-400 hover:text-zinc-200 transition"
                    title="View Campaign"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                {cancellingId === sub.id && (
                  <div className="w-full pt-3 mt-3 border-t border-zinc-800 flex flex-col sm:flex-row items-center gap-3">
                    <input
                      type="text"
                      placeholder="Reason for cancelling (optional)"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="w-full sm:w-auto flex-1 bg-black/40 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
                    />
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCancellingId(null)}
                        className="text-xs text-zinc-400"
                      >
                        Keep Subscription
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        data-testid={`confirm-cancel-btn-${sub.id}`}
                        disabled={updateMutation.isPending}
                        onClick={() => handleConfirmCancel(sub.id)}
                        className="text-xs bg-rose-600 hover:bg-rose-500"
                      >
                        Confirm Cancellation
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BackerSubscriptionsManager;
