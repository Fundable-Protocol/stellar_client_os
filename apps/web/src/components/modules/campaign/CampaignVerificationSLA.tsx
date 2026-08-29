"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Clock, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export interface CampaignVerificationSLAProps {
  campaignId?: string;
  plantingId?: string;
}

export const CampaignVerificationSLA: React.FC<CampaignVerificationSLAProps> = ({
  campaignId = "1",
  plantingId = "1",
}) => {
  const { data, isLoading } = useQuery({
    queryKey: ["campaign-sla", campaignId, plantingId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/sla?campaignId=${campaignId}&plantingId=${plantingId}`);
      if (!res.ok) throw new Error("Failed to load SLA details");
      const json = await res.json();
      return json.data;
    },
  });

  if (isLoading) {
    return <Skeleton className="h-28 w-full rounded-2xl bg-zinc-800/60" />;
  }

  if (!data) return null;

  const { policy, record } = data;

  const statusBadge = record.isVerified ? (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
      <CheckCircle2 className="w-3.5 h-3.5" />
      <span>Trees Verified</span>
    </div>
  ) : record.isSlaBreached ? (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
      <AlertTriangle className="w-3.5 h-3.5" />
      <span>SLA Expired - Auto-Refund Eligible</span>
    </div>
  ) : (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
      <Clock className="w-3.5 h-3.5" />
      <span>Verification Pending ({record.daysRemaining} days left)</span>
    </div>
  );

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 my-4" data-testid="campaign-verification-sla">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              {policy.guaranteeTitle}
            </h4>
            <p className="text-xs text-zinc-400">
              Guaranteed verification within {policy.guaranteePeriodDays} days of planting
            </p>
          </div>
        </div>
        {statusBadge}
      </div>

      <p className="text-xs text-zinc-300 mb-3 leading-relaxed">
        {policy.guaranteeDescription}
      </p>

      <div className="flex items-center gap-2 text-[11px] text-zinc-400 bg-zinc-800/40 p-2.5 rounded-lg border border-zinc-800">
        <RefreshCw className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span>
          <strong>Protection Guarantee:</strong> {policy.autoRefundPolicy}
        </span>
      </div>
    </div>
  );
};

export default CampaignVerificationSLA;
