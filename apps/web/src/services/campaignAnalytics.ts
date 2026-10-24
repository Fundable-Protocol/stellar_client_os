/**
 * Campaign Analytics Service
 * 
 * Issue #1015: Campaign comparison chart - historical impact
 * 
 * Provides historical CO2 sequestration data over time for campaigns,
 * with comparison to baseline tree growth models and similar campaigns.
 */

export interface CampaignHistoricalData {
  campaignId: string;
  campaignName: string;
  dataPoints: HistoricalDataPoint[];
  baselineModel: BaselineModel;
  similarCampaigns: SimilarCampaignComparison[];
}

export interface HistoricalDataPoint {
  timestamp: number; // Unix timestamp (seconds)
  date: string; // ISO date string
  co2Sequestered: number; // tons CO2
  treesPlanted: number;
  cumulativeCo2: number;
  cumulativeTrees: number;
}

export interface BaselineModel {
  modelType: 'standard' | 'tropical' | 'temperate' | 'boreal';
  expectedCo2AtMaturity: number; // tons CO2 per tree at maturity
  growthCurve: GrowthCurvePoint[];
  assumptions: string[];
}

export interface GrowthCurvePoint {
  year: number;
  expectedCo2PerTree: number; // tons CO2 per tree
  survivalRate: number; // 0-1
}

export interface SimilarCampaignComparison {
  campaignId: string;
  campaignName: string;
  region: string;
  projectType: string;
  dataPoints: HistoricalDataPoint[];
  similarityScore: number; // 0-1
}

export interface CampaignComparisonConfig {
  campaignIds: string[];
  timeRange: '1y' | '3y' | '5y' | 'all';
  includeBaseline: boolean;
  includeSimilarCampaigns: boolean;
  maxSimilarCampaigns: number;
}

/**
 * Issue #1173: Creator analytics dashboard
 *
 * Selectable range for the daily analytics series.
 */
export type AnalyticsRange = '7d' | '30d' | '90d' | '1y' | 'all';

/**
 * A single day of creator analytics. This is the shared data shape used by
 * the dashboard charts and the CSV/PDF exports.
 */
export interface DailyAnalyticsPoint {
  timestamp: number; // Unix timestamp (seconds), start of day
  date: string; // ISO date string (YYYY-MM-DD)
  pledges: number; // total pledged amount for the day
  pledgeCount: number; // number of pledges made
  pageViews: number; // campaign page views
  uniqueVisitors: number; // unique visitors to the campaign page
  backers: number; // number of backers (pledges) that day
  conversionRate: number; // backers / uniqueVisitors, 0-1
}

/**
 * Aggregated totals for the selected range, derived from the daily series.
 */
export interface AnalyticsSummary {
  totalPledges: number;
  totalPledgeCount: number;
  totalPageViews: number;
  totalUniqueVisitors: number;
  totalBackers: number;
  conversionRate: number; // totalBackers / totalUniqueVisitors, 0-1
  averageDailyPledges: number;
}

/**
 * Full analytics payload for a campaign over a selectable range.
 */
export interface CampaignAnalyticsSeries {
  campaignId: string;
  campaignName: string;
  range: AnalyticsRange;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  dataPoints: DailyAnalyticsPoint[];
  summary: AnalyticsSummary;
}

/**
 * Mock data source for campaign historical data
 * In production, this would query a database/indexer
 */
export class CampaignAnalyticsService {
  private mockCampaignData: Map<string, CampaignHistoricalData> = new Map();

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData(): void {
    // Create mock data for demo campaigns
    const campaigns = [
      {
        id: 'camp-001',
        name: 'Amazon Reforestation Project',
        region: 'Amazon Basin',
        projectType: 'reforestation',
        startYear: 2020,
        totalTrees: 100000,
      },
      {
        id: 'camp-002',
        name: 'Kenya Mangrove Restoration',
        region: 'Coastal Kenya',
        projectType: 'blue_carbon',
        startYear: 2021,
        totalTrees: 50000,
      },
      {
        id: 'camp-003',
        name: 'Indonesia Peatland Restoration',
        region: 'Sumatra',
        projectType: 'avoided_deforestation',
        startYear: 2019,
        totalTrees: 75000,
      },
    ];

    for (const camp of campaigns) {
      this.mockCampaignData.set(camp.id, this.generateCampaignData(camp));
    }
  }

  private generateCampaignData(camp: { id: string; name: string; region: string; projectType: string; startYear: number; totalTrees: number }, includeSimilar = true): CampaignHistoricalData {
    const currentYear = new Date().getFullYear();
    const years = currentYear - camp.startYear + 1;
    const dataPoints: HistoricalDataPoint[] = [];
    let cumulativeCo2 = 0;
    let cumulativeTrees = 0;

    // Growth parameters based on project type
    const growthParams = this.getGrowthParams(camp.projectType);

    for (let year = 0; year < years; year++) {
      const timestamp = new Date(camp.startYear + year, 6, 1).getTime() / 1000;
      const date = new Date(timestamp * 1000).toISOString().split('T')[0];
      
      // Simulate planting schedule (front-loaded in first 2 years)
      const treesPlantedThisYear = year < 2 
        ? Math.floor(camp.totalTrees * 0.4) 
        : Math.floor(camp.totalTrees * 0.1);
      
      cumulativeTrees += treesPlantedThisYear;
      
      // CO2 sequestration based on tree age and growth curve
      const co2ThisYear = this.calculateYearlyCo2(cumulativeTrees, year, growthParams);
      cumulativeCo2 += co2ThisYear;

      dataPoints.push({
        timestamp,
        date,
        co2Sequestered: Math.round(co2ThisYear * 100) / 100,
        treesPlanted: treesPlantedThisYear,
        cumulativeCo2: Math.round(cumulativeCo2 * 100) / 100,
        cumulativeTrees,
      });
    }

    return {
      campaignId: camp.id,
      campaignName: camp.name,
      dataPoints,
      baselineModel: this.generateBaselineModel(camp.projectType),
      similarCampaigns: includeSimilar ? this.generateSimilarCampaigns(camp) : [],
    };
  }

  private getGrowthParams(projectType: string) {
    const params = {
      reforestation: { co2PerTreeYear1: 0.02, co2PerTreeYear5: 0.15, co2PerTreeYear10: 0.5, survivalYear1: 0.9, survivalYear5: 0.8 },
      blue_carbon: { co2PerTreeYear1: 0.05, co2PerTreeYear5: 0.3, co2PerTreeYear10: 1.0, survivalYear1: 0.85, survivalYear5: 0.75 },
      avoided_deforestation: { co2PerTreeYear1: 0.01, co2PerTreeYear5: 0.08, co2PerTreeYear10: 0.3, survivalYear1: 0.95, survivalYear5: 0.9 },
      community: { co2PerTreeYear1: 0.015, co2PerTreeYear5: 0.1, co2PerTreeYear10: 0.4, survivalYear1: 0.88, survivalYear5: 0.78 },
    };
    return params[projectType as keyof typeof params] || params.reforestation;
  }

  private calculateYearlyCo2(cumulativeTrees: number, year: number, params: any): number {
    // Simple growth curve: linear increase to maturity
    const maturityYear = 10;
    const progress = Math.min(year / maturityYear, 1);
    const co2PerTree = params.co2PerTreeYear1 + (params.co2PerTreeYear10 - params.co2PerTreeYear1) * progress;
    const survivalRate = params.survivalYear1 - (params.survivalYear1 - params.survivalYear5) * progress;
    return cumulativeTrees * co2PerTree * survivalRate;
  }

  private generateBaselineModel(projectType: string): BaselineModel {
    const params = this.getGrowthParams(projectType);
    const growthCurve: GrowthCurvePoint[] = [];
    
    for (let year = 0; year <= 20; year++) {
      const progress = Math.min(year / 10, 1);
      growthCurve.push({
        year,
        expectedCo2PerTree: params.co2PerTreeYear1 + (params.co2PerTreeYear10 - params.co2PerTreeYear1) * Math.min(year / 10, 1),
        survivalRate: params.survivalYear1 - (params.survivalYear1 - params.survivalYear5) * Math.min(year / 5, 1),
      });
    }

    return {
      modelType: projectType === 'blue_carbon' ? 'tropical' : projectType === 'reforestation' ? 'temperate' : 'boreal',
      expectedCo2AtMaturity: params.co2PerTreeYear10,
      growthCurve,
      assumptions: [
        'Standard planting density (1000 trees/hectare)',
        'No major disturbance events (fire, disease, logging)',
        'Standard soil and climate conditions for region',
        'Regular monitoring and maintenance',
      ],
    };
  }

  private generateSimilarCampaigns(camp: { id: string; name: string; region: string; projectType: string; startYear: number; totalTrees: number }): SimilarCampaignComparison[] {
    // Generate 3 similar campaigns for comparison
    const similar = [
      { id: 'sim-001', name: 'Similar Reforestation Project A', region: 'Similar Region A', projectType: camp.projectType },
      { id: 'sim-002', name: 'Similar Reforestation Project B', region: 'Similar Region B', projectType: camp.projectType },
      { id: 'sim-003', name: 'Similar Reforestation Project C', region: 'Similar Region C', projectType: camp.projectType },
    ];

    return similar.map((s, i) => ({
      campaignId: s.id,
      campaignName: s.name,
      region: s.region,
      projectType: s.projectType,
      dataPoints: this.generateCampaignData({ ...camp, id: s.id, name: s.name, region: s.region, totalTrees: camp.totalTrees + (i * 10000 - 15000) }, false).dataPoints,
      similarityScore: 0.9 - i * 0.1,
    }));
  }

  async getCampaignHistoricalData(campaignId: string): Promise<CampaignHistoricalData | null> {
    // Simulate async fetch
    await new Promise(resolve => setTimeout(resolve, 100));
    return this.mockCampaignData.get(campaignId) || null;
  }

  async getCampaignComparison(config: CampaignComparisonConfig): Promise<CampaignHistoricalData[]> {
    await new Promise(resolve => setTimeout(resolve, 200));
    const results: CampaignHistoricalData[] = [];
    
    for (const id of config.campaignIds) {
      const data = this.mockCampaignData.get(id);
      if (data) {
        // Filter by time range
        let filteredDataPoints = data.dataPoints;
        if (config.timeRange !== 'all') {
          const years = config.timeRange === '1y' ? 1 : config.timeRange === '3y' ? 3 : 5;
          const cutoff = Date.now() / 1000 - years * 365 * 24 * 60 * 60;
          filteredDataPoints = data.dataPoints.filter(dp => dp.timestamp >= cutoff);
        }
        results.push({
          ...data,
          dataPoints: filteredDataPoints,
          similarCampaigns: config.includeSimilarCampaigns ? data.similarCampaigns.slice(0, config.maxSimilarCampaigns) : [],
          baselineModel: config.includeBaseline ? data.baselineModel : { ...data.baselineModel, growthCurve: [] },
        });
      }
    }
    
    return results;
  }

  async getAvailableCampaigns(): Promise<Array<{ id: string; name: string; region: string; projectType: string }>> {
    const campaigns: Array<{ id: string; name: string; region: string; projectType: string }> = [];
    for (const [id, data] of this.mockCampaignData) {
      campaigns.push({ id, name: data.campaignName, region: '', projectType: '' });
    }
    return campaigns;
  }

  /**
   * Issue #1173: Historical daily-series provider for the creator dashboard.
   *
   * Returns daily pledges, page views and conversion rate over the selected
   * range. The returned `DailyAnalyticsPoint[]` is the single data shape shared
   * by the dashboard charts and the CSV/PDF exports.
   */
  async getCampaignAnalyticsSeries(
    campaignId: string,
    range: AnalyticsRange = '30d'
  ): Promise<CampaignAnalyticsSeries | null> {
    // Simulate async fetch
    await new Promise(resolve => setTimeout(resolve, 100));

    const campaign = this.mockCampaignData.get(campaignId);
    if (!campaign) {
      return null;
    }

    const dataPoints = this.generateDailyAnalytics(campaignId, range);
    const summary = this.summarizeAnalytics(dataPoints);

    return {
      campaignId,
      campaignName: campaign.campaignName,
      range,
      startDate: dataPoints.length > 0 ? dataPoints[0].date : '',
      endDate: dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].date : '',
      dataPoints,
      summary,
    };
  }

  private getRangeInDays(range: AnalyticsRange): number {
    switch (range) {
      case '7d':
        return 7;
      case '30d':
        return 30;
      case '90d':
        return 90;
      case '1y':
        return 365;
      case 'all':
        return 365;
      default:
        return 30;
    }
  }

  /**
   * Deterministic pseudo-random generator seeded by campaign id and day so the
   * mock series is stable across calls (charts and exports stay consistent).
   */
  private seededRandom(seed: string): () => number {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h += 0x6d2b79f5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private generateDailyAnalytics(campaignId: string, range: AnalyticsRange): DailyAnalyticsPoint[] {
    const days = this.getRangeInDays(range);
    const points: DailyAnalyticsPoint[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const date = day.toISOString().split('T')[0];
      const timestamp = Math.floor(day.getTime() / 1000);

      const rand = this.seededRandom(`${campaignId}:${date}`);

      // Traffic: page views with a mild upward trend and weekly seasonality.
      const dayOfWeek = day.getDay();
      const weekendFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.7 : 1;
      const trendFactor = 1 + (days - i) / (days * 2);
      const pageViews = Math.round((200 + rand() * 400) * weekendFactor * trendFactor);
      const uniqueVisitors = Math.max(1, Math.round(pageViews * (0.55 + rand() * 0.2)));

      // Conversion: 2%-8% of unique visitors become backers.
      const conversionRate = 0.02 + rand() * 0.06;
      const backers = Math.round(uniqueVisitors * conversionRate);
      const pledgeCount = backers;
      const averagePledge = 25 + rand() * 75;
      const pledges = Math.round(backers * averagePledge * 100) / 100;

      points.push({
        timestamp,
        date,
        pledges,
        pledgeCount,
        pageViews,
        uniqueVisitors,
        backers,
        conversionRate: uniqueVisitors > 0 ? Math.round((backers / uniqueVisitors) * 10000) / 10000 : 0,
      });
    }

    return points;
  }

  private summarizeAnalytics(dataPoints: DailyAnalyticsPoint[]): AnalyticsSummary {
    let totalPledges = 0;
    let totalPledgeCount = 0;
    let totalPageViews = 0;
    let totalUniqueVisitors = 0;
    let totalBackers = 0;

    for (const dp of dataPoints) {
      totalPledges += dp.pledges;
      totalPledgeCount += dp.pledgeCount;
      totalPageViews += dp.pageViews;
      totalUniqueVisitors += dp.uniqueVisitors;
      totalBackers += dp.backers;
    }

    const dayCount = dataPoints.length || 1;

    return {
      totalPledges: Math.round(totalPledges * 100) / 100,
      totalPledgeCount,
      totalPageViews,
      totalUniqueVisitors,
      totalBackers,
      conversionRate:
        totalUniqueVisitors > 0
          ? Math.round((totalBackers / totalUniqueVisitors) * 10000) / 10000
          : 0,
      averageDailyPledges: Math.round((totalPledges / dayCount) * 100) / 100,
    };
  }
}

// Singleton instance
export const campaignAnalyticsService = new CampaignAnalyticsService();