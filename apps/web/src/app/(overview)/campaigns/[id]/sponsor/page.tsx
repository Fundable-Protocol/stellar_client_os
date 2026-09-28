"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CAMPAIGN_SPONSORSHIP_TIERS,
  getCampaignSponsorshipTierForCount,
  getDiscountedSponsorshipAmount,
  recordCampaignSponsorshipImpact,
} from "@/lib/campaign-sponsorship-tiers";

const trees = [
  { id: "tree-001", label: "Amazonia restoration", location: "Para, Brazil", impact: "48 kg CO₂e" },
  { id: "tree-002", label: "Mangrove recovery", location: "Mida Creek, Kenya", impact: "31 kg CO₂e" },
  { id: "tree-003", label: "Native woodland", location: "Baja, Mexico", impact: "22 kg CO₂e" },
  { id: "tree-004", label: "Riparian buffer", location: "Murray-Darling, Australia", impact: "36 kg CO₂e" },
];

const steps = ["Select trees", "Enter amount", "Preview", "Confirm"];

export default function SponsorCampaignPage() {
  const { id } = useParams<{ id: string }>();
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [treeCount, setTreeCount] = useState(10);

  const numericAmount = Number(amount);
  const tier = getCampaignSponsorshipTierForCount(treeCount);
  const discountedAmount = getDiscountedSponsorshipAmount(numericAmount, tier);
  const totalImpact = useMemo(() => selected.reduce((sum, treeId) => sum + Number(trees.find((tree) => tree.id === treeId)?.impact.split(" ")[0] ?? 0), 0), [selected]);
  const toggleTree = (treeId: string) => setSelected((current) => current.includes(treeId) ? current.filter((id) => id !== treeId) : [...current, treeId]);
  const next = () => {
    setError("");
    if (step === 1 && selected.length === 0) return setError("Select at least one tree to continue.");
    if (step === 1 && (!Number.isInteger(treeCount) || treeCount < 10)) return setError("Bulk sponsorships start at 10 whole trees.");
    if (step === 2 && (!Number.isFinite(numericAmount) || numericAmount <= 0)) return setError("Enter a contribution greater than zero.");
    setStep((current) => Math.min(4, current + 1));
  };
  const back = () => { setError(""); setStep((current) => Math.max(1, current - 1)); };

  return (
    <main className="mx-auto min-h-full w-full max-w-4xl px-6 py-12 text-white">
      <div className="mb-10">
        <p className="text-sm font-medium text-emerald-300">Campaign {id}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sponsor a living forest</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">Choose the trees you want to support, review the impact of your contribution, and confirm once everything looks right.</p>
      </div>
      <ol className="mb-10 grid grid-cols-4 gap-2" aria-label="Sponsorship steps">
        {steps.map((label, index) => { const number = index + 1; return <li key={label} className={`border-b-2 pb-3 text-sm ${number <= step ? "border-emerald-400 text-emerald-300" : "border-white/10 text-slate-500"}`}><span className="mr-2">{number}.</span>{label}</li>; })}
      </ol>
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
        {step === 1 && <div><h2 className="text-xl font-semibold">Choose a sponsorship tier</h2><p className="mt-2 text-sm text-slate-400">Bulk tiers include a discount and are saved with your campaign impact record.</p><div className="mt-6 grid gap-3 sm:grid-cols-3">{CAMPAIGN_SPONSORSHIP_TIERS.map((option) => <button key={option.id} type="button" aria-pressed={tier.id === option.id} onClick={() => setTreeCount(option.treeCount)} className={`rounded-xl border p-4 text-left transition ${tier.id === option.id ? "border-emerald-400 bg-emerald-400/10" : "border-white/10 bg-black/20 hover:border-white/30"}`}><span className="block font-semibold">{option.treeCount}{option.treeCount === 100 ? "+" : ""} trees</span><span className="mt-2 block text-sm text-emerald-300">{option.discountBps / 100}% off</span></button>)}</div><label htmlFor="tree-count" className="mt-5 block text-sm text-slate-300">Number of trees</label><input id="tree-count" type="number" min="10" step="1" value={treeCount || ""} onChange={(event) => setTreeCount(Number(event.target.value))} className="mt-2 max-w-xs rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white" /><p className="mt-2 text-xs text-slate-400">Selected tier: {tier.treeCount === 100 ? "100+" : tier.treeCount} trees · {tier.discountBps / 100}% discount</p><h3 className="mt-8 text-lg font-semibold">Select restoration projects</h3><p className="mt-2 text-sm text-slate-400">Choose projects to associate with this tier.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{trees.map((tree) => <label key={tree.id} className={`cursor-pointer rounded-xl border p-4 transition ${selected.includes(tree.id) ? "border-emerald-400 bg-emerald-400/10" : "border-white/10 bg-black/20 hover:border-white/30"}`}><input type="checkbox" className="sr-only" checked={selected.includes(tree.id)} onChange={() => toggleTree(tree.id)} /><div className="flex items-start justify-between gap-3"><span className="font-medium">{tree.label}</span><span className="text-xs text-emerald-300">{selected.includes(tree.id) ? "Selected" : "Select"}</span></div><p className="mt-2 text-xs text-slate-400">{tree.location} · Estimated impact {tree.impact}</p></label>)}</div></div>}
        {step === 2 && <div><h2 className="text-xl font-semibold">Enter amount</h2><p className="mt-2 text-sm text-slate-400">Your {treeCount}-tree tier saves {tier.discountBps / 100}% on this contribution.</p><label htmlFor="amount" className="mt-8 block text-sm text-slate-300">Contribution amount before discount</label><div className="mt-2 flex max-w-md items-center rounded-xl border border-white/10 bg-black/20 px-4"><span className="text-slate-400">USDC</span><input id="amount" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full bg-transparent px-4 py-4 text-2xl outline-none" placeholder="0.00" /></div><p className="mt-3 text-xs text-slate-500">Tier quantity: {treeCount} trees · Selected projects: {selected.length}</p></div>}
        {step === 3 && <div><h2 className="text-xl font-semibold">Preview contribution</h2><p className="mt-2 text-sm text-slate-400">Review the sponsorship before opening your wallet.</p><dl className="mt-6 divide-y divide-white/10 rounded-xl border border-white/10"><div className="flex justify-between p-4 text-sm"><dt className="text-slate-400">Sponsorship tier</dt><dd>{treeCount} trees ({tier.discountBps / 100}% off)</dd></div><div className="flex justify-between p-4 text-sm"><dt className="text-slate-400">Selected projects</dt><dd>{selected.length}</dd></div><div className="flex flex-col gap-2 p-4 text-sm"><div className="flex justify-between"><dt className="text-slate-400">Contribution before discount</dt><dd>{numericAmount.toFixed(2)} USDC</dd></div><div className="flex justify-between text-emerald-300"><dt>Tier discount</dt><dd>−{(numericAmount - discountedAmount).toFixed(2)} USDC</dd></div><div className="flex justify-between"><dt className="font-semibold">Contribution after discount</dt><dd className="font-semibold">{discountedAmount.toFixed(2)} USDC</dd></div><div className="ml-4 flex flex-col gap-1 border-l-2 border-white/10 pl-4 text-xs text-slate-500"><div className="flex justify-between"><dt>80% to planter</dt><dd>{(discountedAmount * 0.8).toFixed(2)} USDC</dd></div><div className="flex justify-between"><dt>5% to platform</dt><dd>{(discountedAmount * 0.05).toFixed(2)} USDC</dd></div><div className="flex justify-between"><dt>5% to insurance pool</dt><dd>{(discountedAmount * 0.05).toFixed(2)} USDC</dd></div><div className="flex justify-between"><dt>10% to carbon verification</dt><dd>{(discountedAmount * 0.1).toFixed(2)} USDC</dd></div></div></div><div className="flex justify-between p-4 text-sm"><dt className="text-slate-400">Estimated impact</dt><dd>{totalImpact} kg CO₂e</dd></div><div className="flex justify-between p-4 text-sm"><dt className="text-slate-400">Campaign</dt><dd>{id}</dd></div></dl></div>}
        {step === 4 && <div><h2 className="text-xl font-semibold">Confirm contribution</h2><p className="mt-2 text-sm text-slate-400">Your wallet will ask you to approve the on-chain contribution.</p>{confirmed ? <div className="mt-8 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-emerald-200">Contribution submitted. Tier selection saved for campaign impact tracking.</div> : <div className="mt-8 rounded-xl border border-white/10 bg-black/20 p-5"><p className="text-sm text-slate-300">{discountedAmount.toFixed(2)} USDC for {treeCount} trees across {selected.length} selected project{selected.length === 1 ? "" : "s"}.</p><button type="button" onClick={() => { try { recordCampaignSponsorshipImpact(window.localStorage, { campaignId: id, tierId: tier.id, treeCount, discountBps: tier.discountBps, selectedTreeIds: selected, recordedAt: Date.now() }); setConfirmed(true); } catch { setError("Could not save sponsorship impact data in this browser."); } }} className="mt-5 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300">Confirm in wallet</button></div>}</div>}
        {error && <p role="alert" className="mt-6 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        {!confirmed && <div className="mt-8 flex justify-between"><button type="button" onClick={back} disabled={step === 1} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 disabled:cursor-not-allowed disabled:opacity-30">Back</button>{step < 4 && <button type="button" onClick={next} className="rounded-xl bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-emerald-200">Continue</button>}</div>}
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
