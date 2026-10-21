"use client";

/**
 * Creator dashboard for the ambassador & influencer program.
 *
 * Shows the program totals, the per-ambassador pledge tracking table, the
 * pending invitations and lets the creator invite new ambassadors, record a
 * pledge and re-run the reward assignment.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Coins,
  Loader2,
  Mail,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AmbassadorInviteModal } from "./AmbassadorInviteModal";
import { AmbassadorPledgeTable } from "./AmbassadorPledgeTable";
import {
  AMBASSADOR_TIERS,
  AMBASSADOR_TIER_ORDER,
} from "@/services/campaign-ambassador.service";
import type {
  AmbassadorInvite,
  AmbassadorPledgeSummary,
  AmbassadorProgramSummary,
  AmbassadorTier,
} from "@/types/ambassador";

export interface AmbassadorDashboardProps {
  campaignId: string;
  campaignTitle?: string;
  /** Wallet address of the creator — sent to the API for authorization. */
  creatorAddress: string;
  className?: string;
}

interface DashboardResponse extends AmbassadorProgramSummary {
  invites: AmbassadorInvite[];
}

function formatAmount(amount: string): string {
  try {
    return BigInt(amount).toLocaleString();
  } catch {
    return amount;
  }
}

export function AmbassadorDashboard({
  campaignId,
  campaignTitle,
  creatorAddress,
  className,
}: AmbassadorDashboardProps) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [pledgeOpen, setPledgeOpen] = useState(false);
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [pledgeBacker, setPledgeBacker] = useState("");
  const [pledgeAmbassadorId, setPledgeAmbassadorId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ viewerAddress: creatorAddress });
      const res = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/ambassadors?${query}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load the ambassador program");
      setData(json);
      if (!pledgeAmbassadorId && json.ambassadors?.length) {
        setPledgeAmbassadorId(json.ambassadors[0].ambassador.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the ambassador program");
    } finally {
      setLoading(false);
    }
  }, [campaignId, creatorAddress, pledgeAmbassadorId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, creatorAddress]);

  const runRewards = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/ambassador-rewards`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creatorAddress }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to assign rewards");
      setNotice(
        json.assignedCount > 0
          ? `${json.assignedCount} reward${json.assignedCount === 1 ? "" : "s"} assigned.`
          : "No new rewards were due.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign rewards");
    } finally {
      setBusy(false);
    }
  }, [campaignId, creatorAddress, load]);

  const recordPledge = useCallback(async () => {
    if (!pledgeAmbassadorId) {
      setError("Choose an ambassador first.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/ambassadors/${encodeURIComponent(
          pledgeAmbassadorId,
        )}/pledges`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creatorAddress,
            backerAddress: pledgeBacker.trim(),
            amount: pledgeAmount.trim(),
            source: "referral_code",
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to record the pledge");

      setNotice(
        json.rewardAssigned
          ? `Pledge recorded — ${json.reward.tier} reward assigned automatically.`
          : "Pledge recorded.",
      );
      setPledgeAmount("");
      setPledgeBacker("");
      setPledgeOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record the pledge");
    } finally {
      setBusy(false);
    }
  }, [
    campaignId,
    creatorAddress,
    load,
    pledgeAmbassadorId,
    pledgeAmount,
    pledgeBacker,
  ]);

  const summaries: AmbassadorPledgeSummary[] = data?.ambassadors ?? [];

  return (
    <div className={`space-y-6 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            <Users className="h-4 w-4 text-purple-400" /> Ambassador program
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Recruit ambassadors, track the backers they bring in and reward them automatically.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void runRewards()}
            disabled={busy}
            className="border-zinc-700 text-zinc-300"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Assign rewards
          </Button>
          <AmbassadorInviteModal
            campaignId={campaignId}
            campaignTitle={campaignTitle}
            creatorAddress={creatorAddress}
            onInvited={() => void load()}
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {notice}
        </p>
      )}

      {/* Program totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Ambassadors",
            value: String(data?.totalAmbassadors ?? 0),
            hint: `${data?.activeAmbassadors ?? 0} active`,
            icon: <Users className="h-4 w-4 text-purple-400" />,
          },
          {
            label: "Pending invites",
            value: String(data?.pendingInvites ?? 0),
            hint: "awaiting acceptance",
            icon: <Mail className="h-4 w-4 text-amber-400" />,
          },
          {
            label: "Pledged",
            value: formatAmount(data?.totalPledgedAmount ?? "0"),
            hint: `${data?.totalPledgeCount ?? 0} pledges`,
            icon: <Coins className="h-4 w-4 text-emerald-400" />,
          },
          {
            label: "Rewards owed",
            value: formatAmount(data?.totalCommissionOwed ?? "0"),
            hint: `${data?.totalRewardsAssigned ?? 0} assigned`,
            icon: <Award className="h-4 w-4 text-amber-400" />,
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-center gap-2">
              {stat.icon}
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                {stat.label}
              </span>
            </div>
            <p className="mt-2 text-xl font-bold text-zinc-50">{stat.value}</p>
            <p className="text-xs text-zinc-500">{stat.hint}</p>
          </div>
        ))}
      </div>

      {/* Reward ladder */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Reward ladder</h4>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {AMBASSADOR_TIER_ORDER.map((tier: AmbassadorTier) => {
            const config = AMBASSADOR_TIERS[tier];
            return (
              <div key={tier} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-100">{config.label}</span>
                  <Badge className="bg-zinc-800 text-[11px] text-zinc-300">{tier}</Badge>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  From {formatAmount(config.minPledgeAmount)} pledged ·{" "}
                  {config.commissionRateBps / 100}% commission
                </p>
                <ul className="mt-2 space-y-0.5">
                  {config.perks.map((perk) => (
                    <li key={perk} className="text-[11px] text-zinc-400">
                      • {perk}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pledge tracking */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-zinc-100">Pledge tracking</h4>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPledgeOpen((value) => !value)}
            className="border-zinc-700 text-zinc-300"
          >
            <UserPlus className="h-3.5 w-3.5" /> Record pledge
          </Button>
        </div>

        {pledgeOpen && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:grid-cols-4">
            <div>
              <label htmlFor="pledge-ambassador" className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Ambassador
              </label>
              <select
                id="pledge-ambassador"
                value={pledgeAmbassadorId}
                onChange={(event) => setPledgeAmbassadorId(event.target.value)}
                className="mt-1.5 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                {summaries.map((summary) => (
                  <option key={summary.ambassador.id} value={summary.ambassador.id}>
                    {summary.ambassador.name} ({summary.tier.label})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pledge-backer" className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Backer address
              </label>
              <Input
                id="pledge-backer"
                value={pledgeBacker}
                onChange={(event) => setPledgeBacker(event.target.value)}
                placeholder="G…"
                className="mt-1.5 bg-zinc-950 border-zinc-800 text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="pledge-amount" className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Amount
              </label>
              <Input
                id="pledge-amount"
                value={pledgeAmount}
                onChange={(event) => setPledgeAmount(event.target.value)}
                placeholder="250"
                className="mt-1.5 bg-zinc-950 border-zinc-800 text-zinc-100"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                onClick={() => void recordPledge()}
                disabled={busy || !pledgeAmbassadorId}
                className="w-full bg-purple-600 text-white hover:bg-purple-500"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                Record
              </Button>
            </div>
          </div>
        )}

        <AmbassadorPledgeTable summaries={summaries} loading={loading} />
      </div>

      {/* Pending invitations */}
      {data && data.invites.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-zinc-100">Invitations</h4>
          <ul className="space-y-2">
            {data.invites.map((invite) => (
              <li
                key={invite.token}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-200">
                    {invite.name ?? invite.email}{" "}
                    <span className="text-xs text-zinc-500">({invite.email})</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {invite.tier} · invited by {invite.invitedByName}
                  </p>
                </div>
                <Badge
                  className={
                    invite.status === "pending"
                      ? "bg-amber-500/15 text-amber-300"
                      : invite.status === "accepted"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-zinc-700/40 text-zinc-400"
                  }
                >
                  {invite.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default AmbassadorDashboard;
