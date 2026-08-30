import { notFound } from "next/navigation";
import CampaignShareButtons from "@/components/campaign/CampaignShareButtons";
import { getCampaign } from "@/services/campaign.service";

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
    </main>
  );
}
