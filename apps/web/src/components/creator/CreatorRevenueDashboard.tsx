"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, CircleDollarSign, Clock3, Download, RefreshCw, WalletCards } from "lucide-react";
import { useWallet } from "@/providers/StellarWalletProvider";
import { Button } from "@/components/ui/button";

type Period = "7d" | "30d" | "90d" | "all";
type Revenue = { totals: { grossAmount: number; platformFees: number; netEarned: number; pendingWithdrawals: number; settledAmount: number; availableToWithdraw: number }; campaigns: Array<{ campaignId: string; campaignName: string; grossAmount: number; platformFee: number; netAmount: number; settlement: "pending" | "settled"; earnedAt: number }> };
const money = (value: number) => `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;

export default function CreatorRevenueDashboard() {
  const { address, openModal } = useWallet();
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<Revenue | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const load = async () => {
    if (!address) return;
    setLoading(true);
    try { const response = await fetch(`/api/creators/${encodeURIComponent(address)}/revenue?period=${period}`, { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body.data); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load revenue"); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [address, period]);
  const withdraw = async () => {
    if (!address || !data?.totals.availableToWithdraw) return;
    const response = await fetch(`/api/creators/${encodeURIComponent(address)}/revenue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    const body = await response.json(); setMessage(response.ok ? `Withdrawal ${body.data.id} requested.` : body.error); if (response.ok) void load();
  };
  if (!address) return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center"><WalletCards className="mx-auto mb-3 text-violet-300" /><h2 className="text-xl font-semibold">Connect your wallet to view revenue</h2><p className="mt-2 text-sm text-zinc-400">Your campaign earnings are grouped securely by creator wallet.</p><Button className="mt-5" onClick={openModal}>Connect wallet</Button></section>;
  return <section className="space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Creator finance</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Revenue dashboard</h1><p className="mt-2 text-sm text-zinc-400">One view of what every campaign has earned, what is settled, and what the platform retained.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button></header>
    <div className="flex flex-wrap gap-2">{(["7d", "30d", "90d", "all"] as Period[]).map((item) => <button key={item} onClick={() => setPeriod(item)} className={`rounded-full px-4 py-2 text-sm ${period === item ? "bg-violet-500 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}>{item === "all" ? "All time" : `Last ${item.replace("d", " days")}`}</button>)}</div>
    {message && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</p>}
    {data && <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Total earned", money(data.totals.netEarned), CircleDollarSign, "text-violet-300"], ["Pending", money(data.totals.pendingWithdrawals), Clock3, "text-amber-300"], ["Settled", money(data.totals.settledAmount), ArrowUpRight, "text-emerald-300"], ["Platform fees", money(data.totals.platformFees), Download, "text-zinc-300"]].map(([label, value, Icon, color]) => <article key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5"><div className="flex justify-between text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500"><span>{label}</span><Icon className={String(color)} size={18} /></div><p className="mt-5 text-2xl font-semibold text-white">{value}</p></article>)}</div>
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-violet-100">Available to withdraw</p><p className="mt-1 text-2xl font-semibold text-white">{money(data.totals.availableToWithdraw)}</p><p className="mt-1 text-xs text-violet-200/70">Only settled campaign earnings can be withdrawn.</p></div><Button onClick={() => void withdraw()} disabled={!data.totals.availableToWithdraw}>Withdraw settled funds</Button></div>
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80"><div className="border-b border-zinc-800 px-5 py-4"><h2 className="font-semibold">Campaign breakdown</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-zinc-500"><tr><th className="px-5 py-3">Campaign</th><th className="px-5 py-3">Gross</th><th className="px-5 py-3">Platform fee</th><th className="px-5 py-3">You earned</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-zinc-800">{data.campaigns.map((campaign) => <tr key={campaign.campaignId}><td className="px-5 py-4 font-medium text-white">{campaign.campaignName}<span className="block text-xs text-zinc-500">{new Date(campaign.earnedAt).toLocaleDateString()}</span></td><td className="px-5 py-4 text-zinc-300">{money(campaign.grossAmount)}</td><td className="px-5 py-4 text-zinc-400">{money(campaign.platformFee)}</td><td className="px-5 py-4 text-zinc-200">{money(campaign.netAmount)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${campaign.settlement === "settled" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{campaign.settlement}</span></td></tr>)}{data.campaigns.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-zinc-500">No campaign revenue in this period.</td></tr>}</tbody></table></div></div></>}
  </section>;
}
