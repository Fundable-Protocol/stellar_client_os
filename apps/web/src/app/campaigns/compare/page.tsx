/**
 * Campaign Comparison Page
 * Issue #1015: Campaign comparison chart - historical impact
 */

import { CampaignComparisonChart } from '@/components/modules/campaign-comparison-chart/CampaignComparisonChart';
import Link from 'next/link';
import { Columns3 } from 'lucide-react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Campaign Comparison | Fundable Protocol',
  description: 'Compare historical CO₂ sequestration impact across carbon offset campaigns',
};

export default function CampaignComparisonPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaign Comparison</h1>
          <p className="text-muted-foreground mt-2">
            Compare historical CO₂ sequestration impact across campaigns with baseline models and similar campaign benchmarks
          </p>
        </div>
        <Link
          href="/campaigns/compare/side-by-side"
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <Columns3 className="h-4 w-4" />
          Side-by-Side Tool
        </Link>
      </div>
      <CampaignComparisonChart />
    </div>
  );
}