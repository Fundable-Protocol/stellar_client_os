/**
 * Campaign Leaderboard Service Tests
 * Issue #1003
 */

import { 
  CampaignLeaderboardService, 
  LeaderboardEntry, 
  LeaderboardConfig, 
  LeaderboardMetric,
  LeaderboardResponse,
  CampaignStats,
} from './campaignLeaderboard';

describe('CampaignLeaderboardService', () => {
  let service: CampaignLeaderboardService;

  beforeEach(() => {
    service = new CampaignLeaderboardService();
  });

  describe('getLeaderboard', () => {
    it('should return leaderboard for trees metric', async () => {
      const result = await service.getLeaderboard({
        metric: 'trees',
        limit: 10,
        timeRange: 'all',
      });

      expect(result).toBeDefined();
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries.length).toBeLessThanOrEqual(10);
      expect(result.metric).toBe('trees');
      expect(result.totalCampaigns).toBeGreaterThan(0);
    });

    it('should return leaderboard for co2 metric', async () => {
      const result = await service.getLeaderboard({
        metric: 'co2',
        limit: 10,
        timeRange: 'all',
      });

      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.metric).toBe('co2');
    });

    it('should return leaderboard for sponsors metric', async () => {
      const result = await service.getLeaderboard({
        metric: 'sponsors',
        limit: 10,
        timeRange: 'all',
      });

      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.metric).toBe('sponsors');
    });

    it('should return leaderboard for completion_speed metric', async () => {
      const result = await service.getLeaderboard({
        metric: 'completion_speed',
        limit: 10,
        timeRange: 'all',
      });

      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.metric).toBe('completion_speed');
    });

    it('should return leaderboard for species_diversity metric', async () => {
      const result = await service.getLeaderboard({
        metric: 'species_diversity',
        limit: 10,
        timeRange: 'all',
      });

      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.metric).toBe('species_diversity');
    });

    it('should return leaderboard for completion_rate metric', async () => {
      const result = await service.getLeaderboard({
        metric: 'completion_rate',
        limit: 10,
        timeRange: 'all',
      });

      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.metric).toBe('completion_rate');
    });

    it('should respect limit parameter', async () => {
      const result = await service.getLeaderboard({
        metric: 'trees',
        limit: 3,
        timeRange: 'all',
      });

      expect(result.entries.length).toBeLessThanOrEqual(3);
    });

    it('should filter by region', async () => {
      const result = await service.getLeaderboard({
        metric: 'trees',
        limit: 10,
        timeRange: 'all',
        region: 'Amazon',
      });

      for (const entry of result.entries) {
        expect(entry.region.toLowerCase()).toContain('amazon');
      }
    });

    it('should filter by project type', async () => {
      const result = await service.getLeaderboard({
        metric: 'trees',
        limit: 10,
        timeRange: 'all',
        projectType: 'reforestation',
      });

      for (const entry of result.entries) {
        expect(entry.projectType).toBe('reforestation');
      }
    });

    it('should filter by min sponsors', async () => {
      const result = await service.getLeaderboard({
        metric: 'trees',
        limit: 10,
        timeRange: 'all',
        minSponsors: 1000,
      });

      for (const entry of result.entries) {
        expect(entry.sponsors).toBeGreaterThanOrEqual(1000);
      }
    });

    it('should sort entries in descending order by metric', async () => {
      const result = await service.getLeaderboard({
        metric: 'trees',
        limit: 10,
        timeRange: 'all',
      });

      for (let i = 1; i < result.entries.length; i++) {
        expect(result.entries[i - 1].metricValue).toBeGreaterThanOrEqual(result.entries[i].metricValue);
      }
    });

    it('should include rank, trend, and metric label in entries', async () => {
      const result = await service.getLeaderboard({
        metric: 'trees',
        limit: 10,
        timeRange: 'all',
      });

      for (const entry of result.entries) {
        expect(entry).toHaveProperty('rank');
        expect(entry).toHaveProperty('trend');
        expect(entry).toHaveProperty('metricLabel');
        expect(entry).toHaveProperty('campaignName');
        expect(entry).toHaveProperty('campaignId');
        expect(entry).toHaveProperty('region');
        expect(entry).toHaveProperty('projectType');
        expect(entry).toHaveProperty('sponsors');
        expect(entry).toHaveProperty('treesPlanted');
        expect(entry).toHaveProperty('co2Sequestered');
        expect(entry).toHaveProperty('speciesCount');
        expect(entry).toHaveProperty('completionRate');
      }
    });
  });

  describe('getLeaderboardEntry', () => {
    it('should return entry for valid campaign', async () => {
      const entry = await service.getLeaderboardEntry('camp-001', 'trees');
      expect(entry).not.toBeNull();
      expect(entry?.campaignId).toBe('camp-001');
    });

    it('should return null for invalid campaign', async () => {
      const entry = await service.getLeaderboardEntry('invalid-id', 'trees');
      expect(entry).toBeNull();
    });
  });

  describe('getTopCampaignsByMetric', () => {
    it('should return top campaigns for given metric', async () => {
      const entries = await service.getTopCampaignsByMetric('trees', 5);
      expect(entries.length).toBeLessThanOrEqual(5);
      expect(entries.length).toBeGreaterThan(0);
    });
  });

  describe('getCampaignStats', () => {
    it('should return stats for valid campaign', async () => {
      const stats = await service.getCampaignStats('camp-001');
      expect(stats).not.toBeNull();
      expect(stats?.campaignId).toBe('camp-001');
    });

    it('should return null for invalid campaign', async () => {
      const stats = await service.getCampaignStats('invalid-id');
      expect(stats).toBeNull();
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

  describe('getMetricOptions', () => {
    it('should return all available metrics', async () => {
      const metrics = await service.getMetricOptions();
      expect(metrics.length).toBe(6);
      
      const values = metrics.map(m => m.value);
      expect(values).toContain('trees');
      expect(values).toContain('co2');
      expect(values).toContain('sponsors');
      expect(values).toContain('completion_speed');
      expect(values).toContain('species_diversity');
      expect(values).toContain('completion_rate');
    });

    it('should have label and description for each metric', async () => {
      const metrics = await service.getMetricOptions();
      for (const metric of metrics) {
        expect(metric).toHaveProperty('value');
        expect(metric).toHaveProperty('label');
        expect(metric).toHaveProperty('description');
        expect(metric.label).toBeTruthy();
        expect(metric.description).toBeTruthy();
      }
    });
  });

  describe('LeaderboardEntry structure', () => {
    it('should have all required fields', async () => {
      const result = await service.getLeaderboard({
        metric: 'trees',
        limit: 1,
        timeRange: 'all',
      });

      const entry = result.entries[0];
      expect(entry).toHaveProperty('rank');
      expect(entry).toHaveProperty('campaignId');
      expect(entry).toHaveProperty('campaignName');
      expect(entry).toHaveProperty('region');
      expect(entry).toHaveProperty('projectType');
      expect(entry).toHaveProperty('metricValue');
      expect(entry).toHaveProperty('metricLabel');
      expect(entry).toHaveProperty('trend');
      expect(entry).toHaveProperty('sponsors');
      expect(entry).toHaveProperty('treesPlanted');
      expect(entry).toHaveProperty('co2Sequestered');
      expect(entry).toHaveProperty('speciesCount');
      expect(entry).toHaveProperty('completionRate');
      expect(entry).toHaveProperty('startDate');
    });

    it('should have valid trend values', async () => {
      const result = await service.getLeaderboard({
        metric: 'trees',
        limit: 10,
        timeRange: 'all',
      });

      for (const entry of result.entries) {
        expect(['up', 'down', 'same', 'new']).toContain(entry.trend);
      }
    });
  });
});