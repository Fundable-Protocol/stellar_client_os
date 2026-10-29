import { NextRequest, NextResponse } from 'next/server';
import { CampaignLeaderboardService, LeaderboardMetric, LeaderboardTimeframe } from '@/services/campaignLeaderboard';
import { getFraudRiskFlags, isCampaignWithheld } from '@/services/fraudDetection';

const leaderboardService = new CampaignLeaderboardService();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const metric = (searchParams.get('metric') || 'trees') as LeaderboardMetric;
    const timeframe = (searchParams.get('timeframe') || 'all-time') as LeaderboardTimeframe;
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    // Over-fetch so that withheld campaigns do not shrink the page below `limit`.
    const result = await leaderboardService.getLeaderboard({
      metric,
      timeframe,
      limit: limit + offset + 50,
      offset: 0,
    });

    const campaignIds = result.entries.map((entry) => entry.campaignId);
    const flags = await getFraudRiskFlags(campaignIds, timeframe);

    const visible = result.entries.filter((entry) => !isCampaignWithheld(flags.get(entry.campaignId)));
    const page = visible.slice(offset, offset + limit);

    return NextResponse.json(
      {
        ...result,
        entries: page,
        withheldCount: result.entries.length - visible.length,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to retrieve campaign impact leaderboard', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
