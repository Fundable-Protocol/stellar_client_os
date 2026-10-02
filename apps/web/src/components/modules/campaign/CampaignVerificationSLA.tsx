"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Clock, RefreshCw, AlertTriangle, CheckCircle2, BadgeDollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export interface CampaignVerificationSLAPerps {
  campaignId?: string;
  plantingId?: string;
}

export interface UnderwriterInfo {
  id: string;
  name: string;
  coverageAmountUsd: number;
  premiumUsd: number;
  status: "pending" | "active" | "claimed" | "expired";
  policyNumber: string;
  contactEmail?: string;
}

export interface CampaignSLAData {
  policy: {
    guaranteeTitle: string;
    guaranteePeriodDays: number;
    guaranteeDescription: string;
    autoRefundPolicy: string;
  };
  record: {
    isVerified: boolean;
    isSlaBreached: boolean;
    daysRemaining: number;
  };
  underwriter?: UnderwriterInfo | null;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const underwriterStatusStyles: Record<UnderwriterInfo["status"], string> = {
  pending: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  active: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  claimed: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  expired: "bg-rose-500/10 border-rose-500/30 text-rose-400",
};

export const CampaignVerificationSLA: React.FC<CampaignVerificationSLAProps> = ({
  campaignId = "1",
  plantingId = "1",
}) => {
  const { data, isLoading } = useQuery<CampaignSLAData>({
    queryKey: ["campaign-sla", campaignId, plantingId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/sla?campaignId=${campaignId}&plantingId=${plantingId}`);
      if (!res.ok) throw new Error("Failed to load SLA details");
      const json = await res.json();
      return json.data as CampaignSLAData;
    },
  });

  if (isLoading) {
    return <Skeleton className="h-28 w-full rounded-2xl bg-zinc-800/60" />;
  }

  if (!data) return null;

  const { policy, record, underwriter } = data;

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

      {underwriter ? (
        <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-800/30 p-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <BadgeDollarSign className="w-4 h-4 text-blue-400" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Underwriter
                </p>
                <p className="text-xs font-semibold text-white">
                  {underwriter.name}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${underwriterStatusStyles[underwriter.status]}`}
              >
                {underwriter.status}
              </span>
              <span className="text-[11px] text-zinc-400">
                Policy #{underwriter.policyNumber}
              </span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-zinc-900/60 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Coverage
              </p>
              <p className="text-sm font-semibold text-emerald-400">
                {formatComponent(underwriter.coverageAmountUsd)}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-900/60 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Premium
              </p>
              <p className="text-sm font-semibold text-white">
                {formatComponent(underwriter.premiumUsd)}
              </p>
            </div>
          </div>
          {underwriter.contactEmail ? (
            <p className="mt-2 text-[11px] text-zinc-400">
              Claims contact: {underwriter.contactEmail}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-[11px] text-zinc-400 bg-zinc-800/40 p-2.5 rounded-lg border border-zinc-800">
        <RefreshCw className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span>
          <strong>Protection Guarantee:</strong> {policy.autoRefundPolicy}
        </span>
      </div>
    </div>
  );
};

const formatComponent = (value: number) => formatCurrency(value);

export default CampaignVerificationSLA;
