/**
 * Campaign Budget Breakdown Page
 * Issue #1004: Campaign budget breakdown - cost transparency
 */

import { CampaignBudgetBreakdown } from '@/components/modules/campaign-budget-breakdown/CampaignBudgetBreakdown';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface PageProps {
  params: { campaignId: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: 'Budget Breakdown | Fundable Protocol',
    description: 'View detailed budget breakdown for campaign',
  };
}

export default function CampaignBudgetPage({ params }: PageProps) {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Budget Breakdown</h1>
        <p className="text-muted-foreground mt-2">
          Full cost transparency: see exactly where every dollar goes
        </p>
      </div>
      <CampaignBudgetBreakdown campaignId={params.campaignId} />
    </div>
  );
}