import { notFound } from "next/navigation";
import { getCampaignByPreviewToken } from "@/services/campaign-creator-features.service";

export const dynamic = "force-dynamic";

export default async function CampaignPrivatePreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const campaign = await getCampaignByPreviewToken((await params).token);
  if (!campaign) notFound();
  return (
    <main className="container mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-200">
        Private preview · This draft is not published and is not visible in public campaign search.
      </div>
      <article className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-8">
        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300">DRAFT</span>
          <span className="text-sm text-zinc-500">Preview</span>
        </div>
        <h1 className="text-3xl font-bold text-zinc-50">{campaign.name}</h1>
        <p className="mt-4 whitespace-pre-wrap text-zinc-300">{campaign.description || "No description yet."}</p>
        <dl className="mt-8 grid gap-4 sm:grid-cols-3">
          <div><dt className="text-xs text-zinc-500">Funding goal</dt><dd className="font-semibold text-zinc-100">{campaign.goalAmount}</dd></div>
          <div><dt className="text-xs text-zinc-500">Raised</dt><dd className="font-semibold text-zinc-100">{campaign.raisedAmount}</dd></div>
          <div><dt className="text-xs text-zinc-500">Creator</dt><dd className="truncate font-semibold text-zinc-100">{campaign.creator}</dd></div>
        </dl>
      </article>
    </main>
  );
}
