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

  private generateCampaignData(camp: { id: string; name: string; region: string; projectType: string; startYear: number; totalTrees: number }): CampaignHistoricalData {
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
      similarCampaigns: this.generateSimilarCampaigns(camp),
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
      ...s,
      dataPoints: this.generateCampaignData({ ...camp, id: s.id, name: s.name, region: s.region, totalTrees: camp.totalTrees + (i * 10000 - 15000) }).dataPoints,
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
}

// Singleton instance
export const campaignAnalyticsService = new CampaignAnalyticsService();