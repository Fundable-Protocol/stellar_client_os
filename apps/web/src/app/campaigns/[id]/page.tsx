import { notFound } from "next/navigation";
import Link from "next/link";
import { Heart } from "lucide-react";
import CampaignShareButtons from "@/components/campaign/CampaignShareButtons";
import { getCampaign } from "@/services/campaign.service";
import { VerificationEvidenceGallery } from "@/components/campaign/VerificationEvidenceGallery";
import { CampaignDonationPanel } from "@/components/modules/campaign/donation/CampaignDonationPanel";

export const runtime = "nodejs";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const campaign = await getCampaign((await params).id);
  if (!campaign) notFound();
  const goal = BigInt(campaign.goalAmount);
  const progressPercent = goal > 0n
    ? Math.min(Number((BigInt(campaign.raisedAmount) * 100n) / goal), 100)
    : 0;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-medium text-fundable-purple-2">Impact campaign</p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-950 dark:text-white">{campaign.name}</h1>
        {campaign.description && <p className="mt-3 text-zinc-600 dark:text-zinc-300">{campaign.description}</p>}
        <p className="mt-5 text-sm text-zinc-600 dark:text-zinc-300">
          {campaign.raisedAmount} of {campaign.goalAmount} raised
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-fundable-purple-2"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <a href={`/api/campaigns/${campaign.id}/export?format=csv&report=full`} className="rounded-md bg-fundable-purple-2 px-3 py-2 text-sm font-medium text-white">Export CSV</a>
          <a href={`/api/campaigns/${campaign.id}/export?format=json&report=full`} className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-700">Export JSON</a>
          <Link href={`/campaigns/${campaign.id}/donate`} className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
            <Heart className="h-4 w-4" />
            Donate
          </Link>
        </div>
        <div className="mt-6 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">Share this campaign</p>
          <CampaignShareButtons
            campaignId={campaign.id}
            campaignName={campaign.name}
            description={campaign.description}
            raisedAmount={campaign.raisedAmount}
            goalAmount={campaign.goalAmount}
          />
        </div>
      </section>

      {/* Direct Charitable Contribution (#865) */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-zinc-950 dark:text-white">One-Time Charitable Contribution</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Contribute directly to project costs without purchasing specific trees.
          </p>
        </div>
        <CampaignDonationPanel
          campaignId={campaign.id}
          campaignName={campaign.name}
        />
      </section>

      <VerificationEvidenceGallery evidence={campaign.verificationEvidence ?? []} />
    </main>
  );
}
