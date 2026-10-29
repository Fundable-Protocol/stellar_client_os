"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, Check, Copy, ExternalLink, Link2, MousePointerClick, Users } from "lucide-react";
import { useWallet } from "@/providers/StellarWalletProvider";

type ReferralCampaign = {
  campaignId: string;
  campaignName: string;
  campaignUrl: string;
  code: string;
  clicks: number;
  conversions: number;
  amountRaisedByToken: Record<string, string>;
  referralReward: { description: string; recipientCount: number; updatedAt: number } | null;
};

type CampaignSummary = {
  id: string;
  name: string;
  referralReward?: { description: string; recipientCount: number; updatedAt: number };
};

type Leader = { backerAddress: string; clicks: number; conversions: number; amountRaisedByToken: Record<string, string> };
type CreatorReferralStats = { referralReward: CampaignSummary["referralReward"] | null; leaderboard: Leader[] };

function raisedLabel(amounts: Record<string, string>): string {
  const entries = Object.entries(amounts).filter(([, amount]) => Number(amount) > 0);
  return entries.length ? entries.map(([token, amount]) => `${amount} ${token}`).join(" · ") : "0";
}

export default function BackerReferralDashboard() {
  const { address } = useWallet();
  const [backedCampaigns, setBackedCampaigns] = useState<ReferralCampaign[]>([]);
  const [creatorCampaigns, setCreatorCampaigns] = useState<CampaignSummary[]>([]);
  const [leaderboards, setLeaderboards] = useState<Record<string, Leader[]>>({});
  const [rewardText, setRewardText] = useState<Record<string, string>>({});
  const [recipientCounts, setRecipientCounts] = useState<Record<string, number>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!address) {
      setBackedCampaigns([]);
      setCreatorCampaigns([]);
      setLeaderboards({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const [backerResponse, campaignsResponse] = await Promise.all([
        fetch(`/api/backers/${encodeURIComponent(address)}/referrals`, { cache: "no-store" }),
        fetch(`/api/campaigns?creator=${encodeURIComponent(address)}&limit=100`, { cache: "no-store" }),
      ]);
      if (!backerResponse.ok) throw new Error("Could not load your referral links.");
      const backerData = await backerResponse.json() as { campaigns?: ReferralCampaign[] };
      setBackedCampaigns(backerData.campaigns ?? []);

      if (campaignsResponse.ok) {
        const campaignData = await campaignsResponse.json() as { data?: CampaignSummary[] };
        const owned = campaignData.data ?? [];
        setCreatorCampaigns(owned);
        const initializedText: Record<string, string> = {};
        const initializedCount: Record<string, number> = {};
        for (const campaign of owned) {
          initializedText[campaign.id] = campaign.referralReward?.description ?? "";
          initializedCount[campaign.id] = campaign.referralReward?.recipientCount ?? 1;
        }
        setRewardText(initializedText);
        setRecipientCounts(initializedCount);

        const stats = await Promise.all(owned.map(async (campaign) => {
          const response = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}/referrals?creator=${encodeURIComponent(address)}`, { cache: "no-store" });
          if (!response.ok) return [campaign.id, []] as const;
          const data = await response.json() as CreatorReferralStats;
          return [campaign.id, data.leaderboard ?? []] as const;
        }));
        setLeaderboards(Object.fromEntries(stats));
      } else {
        setCreatorCampaigns([]);
        setLeaderboards({});
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load referral information.");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { void load(); }, [load]);

  const copyLink = async (link: ReferralCampaign) => {
    try {
      await navigator.clipboard.writeText(link.campaignUrl);
      setCopiedCode(link.code);
      window.setTimeout(() => setCopiedCode((current) => current === link.code ? null : current), 1800);
    } catch {
      setMessage("Clipboard access was unavailable. Select and copy the link manually.");
    }
  };

  const saveReward = async (campaign: CampaignSummary) => {
    if (!address) return;
    setSavingId(campaign.id);
    setMessage("");
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}/referrals`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorAddress: address,
          rewardDescription: rewardText[campaign.id] ?? "",
          recipientCount: recipientCounts[campaign.id] ?? 1,
        }),
      });
      const data = await response.json() as { error?: string; referralReward?: CampaignSummary["referralReward"] | null };
      if (!response.ok) throw new Error(data.error ?? "Could not save the reward.");
      setCreatorCampaigns((current) => current.map((item) => item.id === campaign.id ? { ...item, referralReward: data.referralReward ?? undefined } : item));
      setMessage(data.referralReward ? `Reward saved for ${campaign.name}.` : `Referral reward disabled for ${campaign.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the reward.");
    } finally {
      setSavingId(null);
    }
  };

  if (!address) return null;

  return (
    <section className="space-y-8 rounded-2xl border border-violet-500/20 bg-zinc-950/80 p-6 text-zinc-100" data-testid="backer-referral-dashboard">
      <div>
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-violet-300" aria-hidden="true" />
          <h2 className="text-xl font-semibold">Campaign referral links</h2>
        </div>
        <p className="mt-1 text-sm text-zinc-400">Share a separate short link for every campaign you have backed. Track visits, pledges, and referral-raised totals.</p>
        {loading && <p className="mt-4 text-sm text-zinc-400">Loading referral stats…</p>}
        {!loading && backedCampaigns.length === 0 && <p className="mt-4 rounded-lg bg-zinc-900 p-4 text-sm text-zinc-400">Back a campaign to receive its personal referral link and stats.</p>}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {backedCampaigns.map((campaign) => (
            <article key={campaign.campaignId} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
              <h3 className="font-semibold">{campaign.campaignName}</h3>
              <div className="mt-3 flex gap-2">
                <input aria-label={`Referral link for ${campaign.campaignName}`} readOnly value={campaign.campaignUrl} className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-300" />
                <button type="button" onClick={() => void copyLink(campaign)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-violet-400/30 px-3 py-2 text-sm text-violet-200 hover:bg-violet-400/10" aria-label={`Copy referral link for ${campaign.campaignName}`}>
                  {copiedCode === campaign.code ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedCode === campaign.code ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <a href={campaign.campaignUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-violet-200">Open short link <ExternalLink className="h-3 w-3" /></a>
              <dl className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-zinc-950 p-3"><dt className="flex items-center gap-1 text-xs text-zinc-500"><MousePointerClick className="h-3 w-3" /> Clicks</dt><dd className="mt-1 text-lg font-semibold">{campaign.clicks}</dd></div>
                <div className="rounded-lg bg-zinc-950 p-3"><dt className="flex items-center gap-1 text-xs text-zinc-500"><Users className="h-3 w-3" /> Conversions</dt><dd className="mt-1 text-lg font-semibold">{campaign.conversions}</dd></div>
                <div className="rounded-lg bg-zinc-950 p-3"><dt className="flex items-center gap-1 text-xs text-zinc-500"><Award className="h-3 w-3" /> Raised</dt><dd className="mt-1 break-words text-sm font-semibold">{raisedLabel(campaign.amountRaisedByToken)}</dd></div>
              </dl>
              {campaign.referralReward && <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200"><strong>Creator reward:</strong> {campaign.referralReward.description} (top {campaign.referralReward.recipientCount})</p>}
            </article>
          ))}
        </div>
      </div>

      {creatorCampaigns.length > 0 && <div className="border-t border-zinc-800 pt-6">
        <h3 className="text-lg font-semibold">Creator referral rewards</h3>
        <p className="mt-1 text-sm text-zinc-400">Optionally define a reward for the top referrers on each campaign.</p>
        <div className="mt-4 space-y-4">
          {creatorCampaigns.map((campaign) => (
            <article key={campaign.id} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
              <h4 className="font-medium">{campaign.name}</h4>
              <label className="mt-3 block text-xs text-zinc-400" htmlFor={`reward-${campaign.id}`}>Reward description (leave blank to disable)</label>
              <textarea id={`reward-${campaign.id}`} maxLength={500} value={rewardText[campaign.id] ?? ""} onChange={(event) => setRewardText((current) => ({ ...current, [campaign.id]: event.target.value }))} placeholder="e.g. Exclusive campaign merchandise for the top referrers" className="mt-1 min-h-20 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-xs text-zinc-400">Number of top referrers<input type="number" min={1} max={10} value={recipientCounts[campaign.id] ?? 1} onChange={(event) => setRecipientCounts((current) => ({ ...current, [campaign.id]: Number(event.target.value) }))} className="mt-1 block w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" /></label>
                <button type="button" onClick={() => void saveReward(campaign)} disabled={savingId === campaign.id} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{savingId === campaign.id ? "Saving…" : "Save reward"}</button>
              </div>
              {(leaderboards[campaign.id]?.length ?? 0) > 0 && <div className="mt-4"><h5 className="text-sm font-medium text-zinc-300">Top referrers</h5><ol className="mt-2 space-y-1">{leaderboards[campaign.id].slice(0, 5).map((leader, index) => <li key={leader.backerAddress} className="flex justify-between gap-3 rounded-md bg-zinc-950 px-3 py-2 text-xs"><span>{index + 1}. {leader.backerAddress}</span><span className="text-zinc-400">{leader.conversions} pledges · {raisedLabel(leader.amountRaisedByToken)}</span></li>)}</ol></div>}
            </article>
          ))}
        </div>
      </div>}
      {message && <p role="status" className="text-sm text-violet-200">{message}</p>}
    </section>
  );
}
