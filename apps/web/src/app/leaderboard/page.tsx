/**
 * Campaign Impact Leaderboard Page
 * Issue #1003: Campaign impact leaderboard - most trees, most CO2
 */

import { CampaignImpactLeaderboard } from '@/components/modules/campaign-leaderboard/CampaignImpactLeaderboard';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Campaign Leaderboard | Fundable Protocol',
  description: 'View top campaigns by trees planted, CO₂ sequestered, sponsors, and more',
};

export default function LeaderboardPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Campaign Impact Leaderboard</h1>
        <p className="text-muted-foreground mt-2">
          View top campaigns ranked by trees planted, CO₂ sequestered, sponsors, completion speed, species diversity, and completion rate
        </p>
      </div>
      <div className="max-w-6xl mx-auto">
        <CampaignImpactLeaderboard />
      </div>
    </div>
  );
}