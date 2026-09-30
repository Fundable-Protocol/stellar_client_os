/**
 * Campaign Comparison Page
 * Issue #1015: Campaign comparison chart - historical impact
 */

import { CampaignComparisonChart } from '@/components/modules/campaign-comparison-chart/CampaignComparisonChart';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Campaign Comparison | Fundable Protocol',
  description: 'Compare historical CO₂ sequestration impact across carbon offset campaigns',
};

export default function CampaignComparisonPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Campaign Comparison</h1>
        <p className="text-muted-foreground mt-2">
          Compare historical CO₂ sequestration impact across campaigns with baseline models and similar campaign benchmarks
        </p>
      </div>
      <CampaignComparisonChart />
    </div>
  );
}