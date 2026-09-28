/**
 * Campaign Budget Service Tests
 * Issue #1004
 */

import {
  CampaignBudgetService,
  BudgetBreakdown,
  BudgetItem,
  BudgetCategory,
  DEFAULT_BUDGET_ALLOCATION,
} from './campaignBudget';

describe('CampaignBudgetService', () => {
  let service: CampaignBudgetService;

  beforeEach(() => {
    service = new CampaignBudgetService();
  });

  describe('getBudgetBreakdown', () => {
    it('should return budget data for valid campaign ID', async () => {
      const budget = await service.getBudgetBreakdown('camp-001');
      expect(budget).not.toBeNull();
      expect(budget?.campaignId).toBe('camp-001');
      expect(budget?.campaignName).toBe('Amazon Reforestation Project');
      expect(budget?.totalAmount).toBe(50000);
      expect(budget?.currency).toBe('USD');
    });

    it('should return null for invalid ID', async () => {
      const budget = await service.getBudgetBreakdown('invalid-id');
      expect(budget).toBeNull();
    });
  });

  describe('getAllBudgets', () => {
    it('should return all campaign budgets', async () => {
      const budgets = await service.getAllBudgets();
      expect(budgets.length).toBeGreaterThan(0);
      expect(budgets[0]).toHaveProperty('campaignId');
      expect(budgets[0]).toHaveProperty('breakdown');
    });
  });

  describe('calculateSponsorBreakdown', () => {
    it('should scale budget proportionally', async () => {
      const baseBudget = await service.getBudgetBreakdown('camp-001');
      const customBudget = await service.calculateSponsorBreakdown(25000, 'camp-001');
      
      expect(customBudget).not.toBeNull();
      expect(customBudget?.totalAmount).toBe(25000);
      
      // Each item should be scaled by 0.5
      const basePlanter = baseBudget?.breakdown.find(i => i.category === 'planter');
      const customPlanter = customBudget?.breakdown.find(i => i.category === 'planter');
      expect(customPlanter?.amount).toBeCloseTo((basePlanter?.amount || 0) * 0.5, 1);
    });

    it('should preserve percentages when scaling', async () => {
      const customBudget = await service.calculateSponsorBreakdown(10000, 'camp-001');
      const baseBudget = await service.getBudgetBreakdown('camp-001');
      
      for (const customItem of customBudget!.breakdown) {
        const baseItem = baseBudget?.breakdown.find(i => i.category === customItem.category);
        expect(customItem.percentage).toBe(baseItem?.percentage);
      }
    });

    it('should return null for invalid campaign', async () => {
      const result = await service.calculateSponsorBreakdown(10000, 'invalid-id');
      expect(result).toBeNull();
    });
  });

  describe('DEFAULT_BUDGET_ALLOCATION', () => {
    it('should have all required categories', () => {
      const categories: BudgetCategory[] = ['planter', 'platform', 'insurance', 'verification', 'admin'];
      for (const cat of categories) {
        expect(DEFAULT_BUDGET_ALLOCATION[cat]).toBeDefined();
        expect(DEFAULT_BUDGET_ALLOCATION[cat].percentage).toBeGreaterThan(0);
        expect(DEFAULT_BUDGET_ALLOCATION[cat].label).toBeTruthy();
        expect(DEFAULT_BUDGET_ALLOCATION[cat].description).toBeTruthy();
        expect(DEFAULT_BUDGET_ALLOCATION[cat].icon).toBeTruthy();
        expect(DEFAULT_BUDGET_ALLOCATION[cat].color).toBeTruthy();
      }
    });

    it('should sum to 100%', () => {
      const total = Object.values(DEFAULT_BUDGET_ALLOCATION).reduce((sum, config) => sum + config.percentage, 0);
      expect(total).toBe(100);
    });
  });

  describe('BudgetBreakdown structure', () => {
    it('should have valid breakdown items', async () => {
      const budget = await service.getBudgetBreakdown('camp-001');
      expect(budget).not.toBeNull();
      
      for (const item of budget!.breakdown) {
        expect(item).toHaveProperty('category');
        expect(item).toHaveProperty('label');
        expect(item).toHaveProperty('amount');
        expect(item).toHaveProperty('percentage');
        expect(item).toHaveProperty('description');
        expect(item).toHaveProperty('icon');
        expect(item).toHaveProperty('color');
        
        expect(item.amount).toBeGreaterThan(0);
        expect(item.percentage).toBeGreaterThan(0);
        expect(item.percentage).toBeLessThanOrEqual(100);
      }
    });

    it('should sum to 100%', async () => {
      const budget = await service.getBudgetBreakdown('camp-001');
      const totalPercentage = budget!.breakdown.reduce((sum, item) => sum + item.percentage, 0);
      expect(totalPercentage).toBe(100);
    });

    it('should have sub-items for each category', async () => {
      const budget = await service.getBudgetBreakdown('camp-001');
      
      for (const item of budget!.breakdown) {
        if (item.subItems) {
          expect(item.subItems.length).toBeGreaterThan(0);
          for (const sub of item.subItems) {
            expect(sub).toHaveProperty('label');
            expect(sub).toHaveProperty('amount');
            expect(sub).toHaveProperty('percentage');
            expect(sub).toHaveProperty('description');
            
            expect(sub.amount).toBeGreaterThan(0);
            expect(sub.percentage).toBeGreaterThan(0);
            expect(sub.percentage).toBeLessThanOrEqual(100);
          }
          
          // Sub-items should sum to 100% of parent
          const subTotal = item.subItems.reduce((sum, sub) => sum + sub.percentage, 0);
          expect(subTotal).toBe(100);
        }
      }
    });

    it('should have correct total amount', async () => {
      const budget = await service.getBudgetBreakdown('camp-001');
      const totalAmount = budget!.breakdown.reduce((sum, item) => sum + item.amount, 0);
      expect(totalAmount).toBeCloseTo(budget!.totalAmount, 1);
    });
  });

  describe('getAvailableCampaigns', () => {
    it('should return list of campaigns', async () => {
      const campaigns = await service.getAvailableCampaigns();
      expect(campaigns.length).toBeGreaterThan(0);
      expect(campaigns[0]).toHaveProperty('id');
      expect(campaigns[0]).toHaveProperty('name');
    });
  });
});