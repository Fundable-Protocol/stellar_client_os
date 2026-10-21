import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Globe, Leaf, Users, DollarSign, Calendar, MapPin } from "lucide-react";
import { getCampaign } from "@/services/campaign.service";
import {
  deriveSpeciesBreakdown,
  getBackerDemographicsForReport,
  getCampaignImpactReport,
} from "@/services/automated-campaign-impact-report.service";
import { ShareReportButton } from "@/components/campaign/ShareReportButton";

export const runtime = "nodejs";

export default async function CampaignPublicImpactReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  // Load report data
  const report = await getCampaignImpactReport(id);
  const speciesBreakdown = deriveSpeciesBreakdown(campaign) ?? [];
  const demographics = report?.demographics ?? (await getBackerDemographicsForReport(campaign));

  const goal = BigInt(campaign.goalAmount || "0");
  const raised = BigInt(campaign.raisedAmount || "0");
  const percentFunded = goal > 0n ? Math.min(Number((raised * 100n) / goal), 100) : 0;

  const totalCo2 = speciesBreakdown.length > 0
    ? speciesBreakdown.reduce((sum, s) => sum + s.co2KgPerYear, 0)
    : campaign.treeCount * 20;

  const closedDateStr = campaign.statusChangedAt
    ? new Date(campaign.statusChangedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  const generatedDateStr = report?.generatedAt
    ? new Date(report.generatedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {/* Back link */}
      <Link
        href={`/campaigns/${campaign.id}`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {campaign.name}
      </Link>

      {/* Official Header Banner */}
      <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-fundable-purple-2 dark:text-purple-400">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Official Campaign Impact Report
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                {campaign.status}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
              {campaign.name}
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Published impact summary verifying campaign performance, backer demographics, and environmental impact.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Closed: <strong>{closedDateStr}</strong>
              </span>
              <span>•</span>
              <span>
                Report generated: <strong>{generatedDateStr}</strong>
              </span>
              {campaign.location && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {campaign.location}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Share Actions */}
          <div className="shrink-0 pt-2 sm:pt-0">
            <ShareReportButton
              campaignId={campaign.id}
              campaignName={campaign.name}
              downloadUrl={`/api/reports/campaign/${campaign.id}`}
            />
          </div>
        </div>
      </section>

      {/* Performance Summary Grid */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-bold text-zinc-950 dark:text-white">
          Campaign Performance
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Raised */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium uppercase tracking-wider">Raised / Goal</span>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-xl font-bold text-zinc-950 dark:text-white">
              {campaign.raisedAmount} <span className="text-xs font-normal text-zinc-500">/ {campaign.goalAmount}</span>
            </div>
            <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              {percentFunded.toFixed(1)}% achieved
            </div>
          </div>

          {/* Backers */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium uppercase tracking-wider">Backers</span>
              <Users className="h-4 w-4 text-fundable-purple-2" />
            </div>
            <div className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">
              {campaign.sponsorCount.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Unique wallet sponsors
            </div>
          </div>

          {/* Trees */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium uppercase tracking-wider">Trees Planted</span>
              <Leaf className="h-4 w-4 text-green-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-green-600 dark:text-green-400">
              {campaign.treeCount.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Committed trees
            </div>
          </div>

          {/* CO2 */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-xs font-medium uppercase tracking-wider">CO₂ Sequestration</span>
              <Globe className="h-4 w-4 text-blue-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {totalCo2.toFixed(1)} <span className="text-sm font-normal">kg/yr</span>
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Annual carbon offset
            </div>
          </div>
        </div>
      </section>

      {/* Backer Demographics Section */}
      <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-zinc-950 dark:text-white flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-500" />
            Backer Demographics
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Geographic distribution of backers and contribution volume supporting this campaign.
          </p>
        </div>

        {demographics.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No regional backer demographics were recorded for this campaign.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm text-zinc-700 dark:text-zinc-300">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Region / Country</th>
                  <th className="px-4 py-3 font-semibold">Backers</th>
                  <th className="px-4 py-3 font-semibold">Total Contributed</th>
                  <th className="px-4 py-3 font-semibold">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {demographics.map((demo, idx) => (
                  <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-white">
                      {demo.region}
                    </td>
                    <td className="px-4 py-3">{demo.backers.toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">
                      {demo.totalAmount}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                      {demo.share.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Stated Project Impact Section */}
      <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-zinc-950 dark:text-white flex items-center gap-2">
            <Leaf className="h-5 w-5 text-green-500" />
            Stated Project Impact
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Environmental objectives, tree planting milestones, and verified carbon capture outcomes.
          </p>
        </div>

        {campaign.description && (
          <div className="mb-6 rounded-xl bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Project Mission
            </h3>
            <p>{campaign.description}</p>
          </div>
        )}

        {/* Species Breakdown */}
        {speciesBreakdown.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white">
              Tree Species Breakdown
            </h3>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm text-zinc-700 dark:text-zinc-300">
                <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Species</th>
                    <th className="px-4 py-3 font-semibold">Trees Planted</th>
                    <th className="px-4 py-3 font-semibold">CO₂ / yr (kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {speciesBreakdown.map((sp, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                      <td className="px-4 py-3 font-medium text-zinc-950 dark:text-white">
                        {sp.species}
                      </td>
                      <td className="px-4 py-3">{sp.count.toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">
                        {sp.co2KgPerYear.toFixed(1)} kg
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Footer Share Notice */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
        This public link can be freely shared with sponsors, auditors, and community stakeholders.
        Generated by Fundable Protocol.
      </div>
    </main>
  );
}
