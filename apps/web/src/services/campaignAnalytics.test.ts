/**
 * Campaign Analytics Service Tests
 * Issue #1015
 */

import {
  CampaignAnalyticsService,
  CampaignHistoricalData,
  HistoricalDataPoint,
  BaselineModel,
  SimilarCampaignComparison,
} from './campaignAnalytics';

describe('CampaignAnalyticsService', () => {
  let service: CampaignAnalyticsService;

  beforeEach(() => {
    service = new CampaignAnalyticsService();
  });

  describe('getCampaignHistoricalData', () => {
    it('should return campaign data for valid ID', async () => {
      const data = await service.getCampaignHistoricalData('camp-001');
      expect(data).not.toBeNull();
      expect(data?.campaignId).toBe('camp-001');
      expect(data?.campaignName).toBe('Amazon Reforestation Project');
    });

    it('should return null for invalid ID', async () => {
      const data = await service.getCampaignHistoricalData('invalid-id');
      expect(data).toBeNull();
    });
  });

  describe('getCampaignComparison', () => {
    it('should return data for multiple campaigns', async () => {
      const results = await service.getCampaignComparison({
        campaignIds: ['camp-001', 'camp-002'],
        timeRange: 'all',
        includeBaseline: true,
        includeSimilarCampaigns: true,
        maxSimilarCampaigns: 3,
      });

      expect(results).toHaveLength(2);
      expect(results[0].campaignId).toBe('camp-001');
      expect(results[1].campaignId).toBe('camp-002');
    });

    it('should filter by time range', async () => {
      const allTimeResults = await service.getCampaignComparison({
        campaignIds: ['camp-001'],
        timeRange: 'all',
        includeBaseline: false,
        includeSimilarCampaigns: false,
        maxSimilarCampaigns: 0,
      });

      const oneYearResults = await service.getCampaignComparison({
        campaignIds: ['camp-001'],
        timeRange: '1y',
        includeBaseline: false,
        includeSimilarCampaigns: false,
        maxSimilarCampaigns: 0,
      });

      expect(oneYearResults[0].dataPoints.length).toBeLessThanOrEqual(allTimeResults[0].dataPoints.length);
    });

    it('should include baseline model when requested', async () => {
      const withBaseline = await service.getCampaignComparison({
        campaignIds: ['camp-001'],
        timeRange: 'all',
        includeBaseline: true,
        includeSimilarCampaigns: false,
        maxSimilarCampaigns: 0,
      });

      const withoutBaseline = await service.getCampaignComparison({
        campaignIds: ['camp-001'],
        timeRange: 'all',
        includeBaseline: false,
        includeSimilarCampaigns: false,
        maxSimilarCampaigns: 0,
      });

      expect(withBaseline[0].baselineModel.growthCurve.length).toBeGreaterThan(0);
      expect(withoutBaseline[0].baselineModel.growthCurve.length).toBe(0);
    });

    it('should include similar campaigns when requested', async () => {
      const withSimilar = await service.getCampaignComparison({
        campaignIds: ['camp-001'],
        timeRange: 'all',
        includeBaseline: false,
        includeSimilarCampaigns: true,
        maxSimilarCampaigns: 3,
      });

      const withoutSimilar = await service.getCampaignComparison({
        campaignIds: ['camp-001'],
        timeRange: 'all',
        includeBaseline: false,
        includeSimilarCampaigns: false,
        maxSimilarCampaigns: 0,
      });

      expect(withSimilar[0].similarCampaigns.length).toBeGreaterThan(0);
      expect(withoutSimilar[0].similarCampaigns.length).toBe(0);
    });

    it('should limit similar campaigns', async () => {
      const results = await service.getCampaignComparison({
        campaignIds: ['camp-001'],
        timeRange: 'all',
        includeBaseline: false,
        includeSimilarCampaigns: true,
        maxSimilarCampaigns: 2,
      });

      expect(results[0].similarCampaigns.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getAvailableCampaigns', () => {
    it('should return list of available campaigns', async () => {
      const campaigns = await service.getAvailableCampaigns();
      expect(campaigns.length).toBeGreaterThan(0);
      expect(campaigns[0]).toHaveProperty('id');
      expect(campaigns[0]).toHaveProperty('name');
    });
  });

  describe('HistoricalDataPoint structure', () => {
    it('should have required fields', async () => {
      const data = await service.getCampaignHistoricalData('camp-001');
      expect(data).not.toBeNull();
      
      const point = data!.dataPoints[0];
      expect(point).toHaveProperty('timestamp');
      expect(point).toHaveProperty('date');
      expect(point).toHaveProperty('co2Sequestered');
      expect(point).toHaveProperty('treesPlanted');
      expect(point).toHaveProperty('cumulativeCo2');
      expect(point).toHaveProperty('cumulativeTrees');
      
      expect(typeof point.timestamp).toBe('number');
      expect(typeof point.date).toBe('string');
      expect(typeof point.co2Sequestered).toBe('number');
      expect(typeof point.treesPlanted).toBe('number');
      expect(typeof point.cumulativeCo2).toBe('number');
      expect(typeof point.cumulativeTrees).toBe('number');
    });

    it('should have monotonically increasing cumulative values', async () => {
      const data = await service.getCampaignHistoricalData('camp-001');
      expect(data).not.toBeNull();
      
      let prevCo2 = 0;
      let prevTrees = 0;
      
      for (const point of data!.dataPoints) {
        expect(point.cumulativeCo2).toBeGreaterThanOrEqual(prevCo2);
        expect(point.cumulativeTrees).toBeGreaterThanOrEqual(prevTrees);
        prevCo2 = point.cumulativeCo2;
        prevTrees = point.cumulativeTrees;
      }
    });
  });

  describe('BaselineModel structure', () => {
    it('should have valid growth curve', async () => {
      const data = await service.getCampaignHistoricalData('camp-001');
      const baseline = data!.baselineModel;
      
      expect(baseline).toHaveProperty('modelType');
      expect(baseline).toHaveProperty('expectedCo2AtMaturity');
      expect(baseline).toHaveProperty('growthCurve');
      expect(baseline).toHaveProperty('assumptions');
      
      expect(baseline.growthCurve.length).toBeGreaterThan(0);
      expect(baseline.assumptions.length).toBeGreaterThan(0);
      
      for (const point of baseline.growthCurve) {
        expect(point).toHaveProperty('year');
        expect(point).toHaveProperty('expectedCo2PerTree');
        expect(point).toHaveProperty('survivalRate');
        expect(point.survivalRate).toBeGreaterThanOrEqual(0);
        expect(point.survivalRate).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('SimilarCampaignComparison structure', () => {
    it('should have valid similarity scores', async () => {
      const data = await service.getCampaignHistoricalData('camp-001');
      expect(data).not.toBeNull();
      
      for (const sim of data!.similarCampaigns) {
        expect(sim).toHaveProperty('campaignId');
        expect(sim).toHaveProperty('campaignName');
        expect(sim).toHaveProperty('region');
        expect(sim).toHaveProperty('projectType');
        expect(sim).toHaveProperty('dataPoints');
        expect(sim).toHaveProperty('similarityScore');
        
        expect(sim.similarityScore).toBeGreaterThanOrEqual(0);
        expect(sim.similarityScore).toBeLessThanOrEqual(1);
        expect(sim.dataPoints.length).toBeGreaterThan(0);
      }
    });
  });
});