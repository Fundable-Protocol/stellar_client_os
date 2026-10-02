import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCampaign } from "@/services/campaign.service";
import { CampaignDonationPanel } from "@/components/modules/campaign/donation/CampaignDonationPanel";

export const runtime = "nodejs";

export default async function CampaignDonatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href={`/campaigns/${campaign.id}`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {campaign.name}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">
          Make a Charitable Donation
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Contribute directly to <strong>{campaign.name}</strong> without purchasing specific trees.
          Your funds are allocated at the campaign creator's discretion for project costs and operational expenses.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <CampaignDonationPanel
          campaignId={campaign.id}
          campaignName={campaign.name}
        />
      </div>
    </main>
  );
}