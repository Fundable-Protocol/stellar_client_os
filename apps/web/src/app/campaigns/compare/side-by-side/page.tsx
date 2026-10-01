import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import CampaignSideBySideComparison from "@/components/modules/campaign/campaign-side-by-side-comparison";

export const metadata: Metadata = {
  title: "Side-by-Side Campaign Comparison | Fundable Protocol",
  description: "Compare up to 3 campaigns side-by-side: tree species, location, completion rate, CO2 impact, sponsor count, and cost per tree.",
};

export default function SideBySideComparisonPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <Link
          href="/campaigns/compare"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Overview
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Side-by-Side Campaign Comparison
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Compare up to 3 campaigns side-by-side: tree species, location, completion rate, CO₂ impact, sponsor count, and cost per tree.
        </p>
      </div>

      <CampaignSideBySideComparison />
    </div>
  );
}