/**
 * Campaign Impact Leaderboard Service
 * 
 * Issue #1003: Campaign impact leaderboard - most trees, most CO2
 * 
 * Public leaderboard showing top campaigns by:
 * - Total trees planted
 * - CO2 sequestered
 * - Sponsors count
 * - Fastest completion
 * - Most diverse species
 */

export interface LeaderboardEntry {
  rank: number;
  campaignId: string;
  campaignName: string;
  region: string;
  projectType: string;
  metricValue: number;
  metricLabel: string;
  previousRank?: number;
  trend: 'up' | 'down' | 'same' | 'new';
  sponsors: number;
  treesPlanted: number;
  co2Sequestered: number;
  speciesCount: number;
  completionRate: number; // 0-1
  startDate: string;
  endDate?: string;
}

export type LeaderboardMetric = 
  | 'trees' 
  | 'co2' 
  | 'sponsors' 
  | 'completion_speed' 
  | 'species_diversity' 
  | 'completion_rate';

export interface LeaderboardConfig {
  metric: LeaderboardMetric;
  limit: number;
  timeRange: 'all' | 'year' | 'quarter' | 'month';
  region?: string;
  projectType?: string;
  minSponsors?: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  metric: LeaderboardMetric;
  lastUpdated: string;
  totalCampaigns: number;
}

export interface CampaignStats {
  campaignId: string;
  campaignName: string;
  region: string;
  projectType: string;
  totalTrees: number;
  totalCo2: number;
  totalSponsors: number;
  speciesCount: number;
  startDate: string;
  endDate?: string;
  completionRate: number;
  completionDays?: number;
}

/**
 * Campaign Leaderboard Service
 */
export class CampaignLeaderboardService {
  private mockCampaignStats: Map<string, CampaignStats> = new Map();

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData(): void {
    const campaigns: CampaignStats[] = [
      {
        campaignId: 'camp-001',
        campaignName: 'Amazon Reforestation Project',
        region: 'Amazon Basin',
        projectType: 'reforestation',
        totalTrees: 125000,
        totalCo2: 45000,
        totalSponsors: 1250,
        speciesCount: 42,
        startDate: '2020-01-15',
        completionRate: 0.95,
        completionDays: 420,
      },
      {
        campaignId: 'camp-002',
        campaignName: 'Kenya Mangrove Restoration',
        region: 'Coastal Kenya',
        projectType: 'blue_carbon',
        totalTrees: 78000,
        totalCo2: 62000,
        totalSponsors: 890,
        speciesCount: 8,
        startDate: '2021-03-20',
        completionRate: 0.88,
        completionDays: 380,
      },
      {
        campaignId: 'camp-003',
        campaignName: 'Indonesia Peatland Restoration',
        region: 'Sumatra',
        projectType: 'avoided_deforestation',
        totalTrees: 92000,
        totalCo2: 38000,
        totalSponsors: 1100,
        speciesCount: 15,
        startDate: '2019-06-10',
        completionRate: 1.0,
        completionDays: 320,
      },
      {
        campaignId: 'camp-004',
        campaignName: 'Brazil Atlantic Forest Corridor',
        region: 'Atlantic Forest',
        projectType: 'reforestation',
        totalTrees: 65000,
        totalCo2: 28000,
        totalSponsors: 780,
        speciesCount: 35,
        startDate: '2021-09-01',
        completionRate: 0.72,
      },
      {
        campaignId: 'camp-005',
        campaignName: 'Ethiopia Highland Reforestation',
        region: 'Ethiopian Highlands',
        projectType: 'community',
        totalTrees: 48000,
        totalCo2: 15000,
        totalSponsors: 560,
        speciesCount: 12,
        startDate: '2022-02-14',
        completionRate: 0.55,
      },
      {
        campaignId: 'camp-006',
        campaignName: 'Philippines Mangrove Reforestation',
        region: 'Philippines',
        projectType: 'blue_carbon',
        totalTrees: 42000,
        totalCo2: 35000,
        totalSponsors: 450,
        speciesCount: 10,
        startDate: '2022-05-20',
        completionRate: 0.68,
      },
      {
        campaignId: 'camp-007',
        campaignName: 'Peru Amazon Conservation',
        region: 'Peruvian Amazon',
        projectType: 'avoided_deforestation',
        totalTrees: 38000,
        totalCo2: 42000,
        totalSponsors: 620,
        speciesCount: 28,
        startDate: '2020-11-05',
        completionRate: 0.85,
        completionDays: 400,
      },
      {
        campaignId: 'camp-008',
        campaignName: 'Madagascar Dry Forest Recovery',
        region: 'Madagascar',
        projectType: 'reforestation',
        totalTrees: 35000,
        totalCo2: 12000,
        totalSponsors: 380,
        speciesCount: 22,
        startDate: '2022-08-10',
        completionRate: 0.45,
      },
      {
        campaignId: 'camp-009',
        campaignName: 'Costa Rica Cloud Forest',
        region: 'Costa Rica',
        projectType: 'reforestation',
        totalTrees: 32000,
        totalCo2: 18000,
        totalSponsors: 420,
        speciesCount: 40,
        startDate: '2021-07-01',
        completionRate: 0.9,
        completionDays: 365,
      },
      {
        campaignId: 'camp-010',
        campaignName: 'Tanzania Coastal Mangroves',
        region: 'Tanzania',
        projectType: 'blue_carbon',
        totalTrees: 28000,
        totalCo2: 25000,
        totalSponsors: 310,
        speciesCount: 6,
        startDate: '2022-03-15',
        completionRate: 0.6,
      },
    ];

    for (const camp of campaigns) {
      this.mockCampaignStats.set(camp.campaignId, camp);
    }
  }

  private calculateRankChange(currentRank: number, previousRanks: Map<string, number>, campaignId: string): { previousRank?: number; trend: 'up' | 'down' | 'same' | 'new' } {
    const prevRank = previousRanks.get(campaignId);
    if (prevRank === undefined) return { trend: 'new' };
    if (prevRank === currentRank) return { previousRank: prevRank, trend: 'same' };
    if (prevRank > currentRank) return { previousRank: prevRank, trend: 'up' };
    return { previousRank: prevRank, trend: 'down' };
  }

  private getMetricValue(stats: CampaignStats, metric: LeaderboardMetric): number {
    switch (metric) {
      case 'trees': return stats.totalTrees;
      case 'co2': return stats.totalCo2;
      case 'sponsors': return stats.totalSponsors;
      case 'completion_speed': return stats.completionDays ? 1 / stats.completionDays : 0;
      case 'species_diversity': return stats.speciesCount;
      case 'completion_rate': return stats.completionRate * 100;
    }
  }

  private getMetricLabel(metric: LeaderboardMetric): string {
    const labels: Record<LeaderboardMetric, string> = {
      trees: 'Trees Planted',
      co2: 'CO₂ Sequestered (tons)',
      sponsors: 'Sponsors',
      completion_speed: 'Completion Speed (1/days)',
      species_diversity: 'Species Count',
      completion_rate: 'Completion Rate (%)',
    };
    return labels[metric];
  }

  private formatMetricValue(value: number, metric: LeaderboardMetric): string {
    switch (metric) {
      case 'trees':
      case 'sponsors':
      case 'species_diversity':
        return new Intl.NumberFormat().format(Math.round(value));
      case 'co2':
        return new Intl.NumberFormat().format(Math.round(value)) + ' tons';
      case 'completion_speed':
        return value.toFixed(4);
      case 'completion_rate':
        return `${value.toFixed(1)}%`;
      default:
        return value.toString();
    }
  }

  async getLeaderboard(config: LeaderboardConfig): Promise<LeaderboardResponse> {
    await new Promise(resolve => setTimeout(resolve, 150));

    let campaigns = Array.from(this.mockCampaignStats.values());

    // Apply filters
    if (config.region) {
      campaigns = campaigns.filter(c => c.region.toLowerCase().includes(config.region!.toLowerCase()));
    }
    if (config.projectType) {
      campaigns = campaigns.filter(c => c.projectType === config.projectType);
    }
    if (config.minSponsors) {
      campaigns = campaigns.filter(c => c.totalSponsors >= config.minSponsors!);
    }

    // Time range filter would go here in production

    // Sort by metric
    campaigns.sort((a, b) => {
      const aVal = this.getMetricValue(a, config.metric);
      const bVal = this.getMetricValue(b, config.metric);
      return bVal - aVal; // Descending
    });

    // Limit results
    const limited = campaigns.slice(0, config.limit);

    // Calculate rank changes (mock previous ranks)
    const previousRanks = new Map<string, number>();
    // In production, would fetch from historical data
    for (let i = 0; i < limited.length; i++) {
      previousRanks.set(limited[i].campaignId, i + 1 + Math.floor(Math.random() * 3) - 1);
    }

    const entries: LeaderboardEntry[] = limited.map((campaign, index) => {
      const rank = index + 1;
      const metricValue = this.getMetricValue(campaign, config.metric);
      const rankChange = this.calculateRankChange(rank, previousRanks, campaign.campaignId);

      return {
        rank,
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        region: campaign.region,
        projectType: campaign.projectType,
        metricValue,
        metricLabel: this.getMetricLabel(config.metric),
        previousRank: rankChange.previousRank,
        trend: rankChange.trend,
        sponsors: campaign.totalSponsors,
        treesPlanted: campaign.totalTrees,
        co2Sequestered: campaign.totalCo2,
        speciesCount: campaign.speciesCount,
        completionRate: campaign.completionRate,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
      };
    });

    return {
      entries,
      metric: config.metric,
      lastUpdated: new Date().toISOString(),
      totalCampaigns: campaigns.length,
    };
  }

  async getLeaderboardEntry(campaignId: string, metric: LeaderboardMetric = 'trees'): Promise<LeaderboardEntry | null> {
    const stats = this.mockCampaignStats.get(campaignId);
    if (!stats) return null;

    const allEntries = (await this.getLeaderboard({ metric, limit: 1000, timeRange: 'all' })).entries;
    const entry = allEntries.find(e => e.campaignId === campaignId);
    return entry || null;
  }

  async getTopCampaignsByMetric(metric: LeaderboardMetric, limit = 10): Promise<LeaderboardEntry[]> {
    const response = await this.getLeaderboard({ metric, limit, timeRange: 'all' });
    return response.entries;
  }

  async getCampaignStats(campaignId: string): Promise<CampaignStats | null> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return this.mockCampaignStats.get(campaignId) || null;
  }

  async getAvailableCampaigns(): Promise<Array<{ id: string; name: string; region: string; projectType: string }>> {
    const campaigns: Array<{ id: string; name: string; region: string; projectType: string }> = [];
    for (const [id, stats] of this.mockCampaignStats) {
      campaigns.push({ id, name: stats.campaignName, region: stats.region, projectType: stats.projectType });
    }
    return campaigns;
  }

  async getMetricOptions(): Promise<Array<{ value: LeaderboardMetric; label: string; description: string }>> {
    return [
      { value: 'trees', label: 'Most Trees Planted', description: 'Total number of trees planted' },
      { value: 'co2', label: 'Most CO₂ Sequestered', description: 'Total tons of CO₂ sequestered' },
      { value: 'sponsors', label: 'Most Sponsors', description: 'Number of unique sponsors' },
      { value: 'completion_speed', label: 'Fastest Completion', description: 'Fastest time to completion' },
      { value: 'species_diversity', label: 'Most Diverse Species', description: 'Highest number of tree species' },
      { value: 'completion_rate', label: 'Highest Completion Rate', description: 'Best project completion percentage' },
    ];
  }
}

export const campaignLeaderboardService = new CampaignLeaderboardService();