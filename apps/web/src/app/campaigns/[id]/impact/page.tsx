import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Leaf } from "lucide-react";
import { getCampaign } from "@/services/campaign.service";
import { CampaignImpactCalculator } from "@/components/modules/impact/CampaignImpactCalculator";

export const runtime = "nodejs";

export default async function CampaignImpactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={`/campaigns/${campaign.id}`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {campaign.name}
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <Leaf className="h-5 w-5" />
          <span className="text-sm font-semibold uppercase tracking-wider">Environmental Impact</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">
          CO₂ Sequestration Calculator & Projections
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Calculate multi-year carbon offsets and environmental impact for <strong>{campaign.name}</strong> based on tree species, volume, and growth rates.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <CampaignImpactCalculator
          campaignSpeciesId={campaign.treeSpecies ?? undefined}
          campaignTreeCount={campaign.treeCount ?? 10}
        />
      </div>
    </main>
  );
}