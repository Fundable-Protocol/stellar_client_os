import { getCampaign } from "@/services/campaign.service";
import { buildCampaignImpactWidgetData } from "@/services/campaign-impact-widget.service";

export const dynamic = "force-dynamic";

export default async function CampaignImpactWidgetPage({ params }: { params: Promise<{ id: string }> }) {
  const campaign = await getCampaign((await params).id);
  if (!campaign) return <main className="p-6 text-sm text-red-300">Campaign not found.</main>;
  const impact = buildCampaignImpactWidgetData(campaign);
  return (
    <main className="min-h-screen bg-slate-950 p-5 font-sans text-white">
      <section className="mx-auto max-w-sm rounded-2xl border border-emerald-400/30 bg-slate-900 p-5 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Fundable impact</p>
        <h1 className="mt-2 text-xl font-bold">{impact.title}</h1>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-700">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${impact.progressPercent}%` }} />
        </div>
        <p className="mt-2 text-sm text-slate-300">{impact.progressPercent}% funded · {impact.status.toLowerCase()}</p>
        <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div><dd className="text-lg font-bold">{impact.treesPlanted}</dd><dt className="text-[11px] text-slate-400">Trees</dt></div>
          <div><dd className="text-lg font-bold">{impact.co2OffsetTons}t</dd><dt className="text-[11px] text-slate-400">CO₂ offset</dt></div>
          <div><dd className="text-lg font-bold">{impact.sponsorCount}</dd><dt className="text-[11px] text-slate-400">Sponsors</dt></div>
        </dl>
        <a className="mt-5 block text-center text-xs text-emerald-300 underline" href={`/campaigns/${encodeURIComponent(impact.campaignId)}`}>View campaign</a>
      </section>
    </main>
  );
}
