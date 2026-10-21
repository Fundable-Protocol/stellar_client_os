import Link from "next/link";
import { Sparkles, ArrowRight, Tag, Folder } from "lucide-react";
import type { CampaignRecord } from "@/services/campaign.service";
import { getRelatedCampaigns } from "@/services/campaign-related.service";

interface RelatedCampaignsShelfProps {
  currentCampaignId: string;
}

export async function RelatedCampaignsShelf({ currentCampaignId }: RelatedCampaignsShelfProps) {
  const related = await getRelatedCampaigns(currentCampaignId, { limit: 4 });

  if (!related || related.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="related-campaigns-heading"
      className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex items-center justify-between pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-fundable-purple-2" />
            <h2
              id="related-campaigns-heading"
              className="text-xl font-bold text-zinc-950 dark:text-white"
            >
              Related Campaigns
            </h2>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Discover similar initiatives in the same category or with shared ecological goals.
          </p>
        </div>
      </div>

      {/* Horizontally scrollable shelf */}
      <div
        data-testid="related-campaigns-shelf"
        className="flex gap-4 overflow-x-auto pb-4 pt-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700"
      >
        {related.map((campaign: CampaignRecord) => {
          const goal = BigInt(campaign.goalAmount || "0");
          const raised = BigInt(campaign.raisedAmount || "0");
          const percent = goal > 0n
            ? Math.min(Number((raised * 100n) / goal), 100)
            : 0;
          const isActive = campaign.status === "ACTIVE";

          return (
            <article
              key={campaign.id}
              className="flex w-[280px] flex-shrink-0 flex-col justify-between rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 transition-all hover:border-fundable-purple-2/50 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  {campaign.category ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-fundable-purple-2">
                      <Folder className="h-3 w-3" />
                      {campaign.category}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Impact
                    </span>
                  )}
                  {isActive ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {campaign.status}
                    </span>
                  )}
                </div>

                <h3 className="mt-2 line-clamp-1 text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {campaign.name}
                </h3>

                {campaign.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {campaign.description}
                  </p>
                )}

                {/* Tags preview */}
                {campaign.speciesTags && campaign.speciesTags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {campaign.speciesTags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 rounded bg-zinc-200/60 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        <Tag className="h-2.5 w-2.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
                <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <span>{percent}% funded</span>
                  <span>{campaign.raisedAmount} XLM</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-fundable-purple-2 transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <Link
                  href={`/campaigns/${campaign.id}`}
                  className="mt-3.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  View campaign
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
