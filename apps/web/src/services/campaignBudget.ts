/**
 * Campaign Budget Breakdown Service
 * 
 * Issue #1004: Campaign budget breakdown - cost transparency
 * 
 * Shows breakdown of sponsor payment:
 * - % to planter
 * - % to platform
 * - % to insurance pool
 * - % to carbon verification
 * Full cost transparency.
 */

export interface BudgetBreakdown {
  campaignId: string;
  campaignName: string;
  totalAmount: number; // in USD
  currency: 'USD' | 'EUR' | 'GBP';
  breakdown: BudgetItem[];
  totalPercentage: number; // should be 100
  lastUpdated: string; // ISO date
}

export interface BudgetItem {
  category: BudgetCategory;
  label: string;
  amount: number; // absolute amount
  percentage: number; // 0-100
  description: string;
  icon: string; // lucide icon name
  color: string; // hex color for charts
  subItems?: BudgetSubItem[];
}

export type BudgetCategory = 
  | 'planter' 
  | 'platform' 
  | 'insurance' 
  | 'verification' 
  | 'admin' 
  | 'other';

export interface BudgetSubItem {
  label: string;
  amount: number;
  percentage: number;
  description: string;
}

export interface BudgetConfig {
  campaignId: string;
  sponsorAmount: number; // amount sponsor pays
  includeBreakdown: boolean;
  includeSubItems: boolean;
  showPercentage: boolean;
  currency: 'USD' | 'EUR' | 'GBP';
}

/**
 * Default budget allocation percentages
 * These can be configured per campaign or globally
 */
export const DEFAULT_BUDGET_ALLOCATION: Record<BudgetCategory, { percentage: number; label: string; description: string; icon: string; color: string }> = {
  planter: {
    percentage: 65,
    label: 'Planter',
    description: 'Direct payment to tree planting organization for labor, seedlings, and site preparation',
    icon: 'Users',
    color: '#22c55e', // green
  },
  platform: {
    percentage: 15,
    label: 'Platform Fee',
    description: 'Technology platform maintenance, payment processing, and customer support',
    icon: 'Monitor',
    color: '#3b82f6', // blue
  },
  insurance: {
    percentage: 10,
    label: 'Insurance Pool',
    description: 'Risk pool for tree survival guarantee, natural disaster coverage, and replanting fund',
    icon: 'Shield',
    color: '#f59e0b', // amber
  },
  verification: {
    percentage: 7,
    label: 'Carbon Verification',
    description: 'Third-party auditing, satellite monitoring, and certification costs',
    icon: 'CheckCircle',
    color: '#8b5cf6', // purple
  },
  admin: {
    percentage: 3,
    label: 'Administration',
    description: 'Legal, compliance, reporting, and operational overhead',
    icon: 'FileText',
    color: '#6b7280', // gray
  },
};

export class CampaignBudgetService {
  private campaignBudgets: Map<string, BudgetBreakdown> = new Map();

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData(): void {
    // Initialize mock data for demo campaigns
    const campaigns = [
      {
        id: 'camp-001',
        name: 'Amazon Reforestation Project',
        totalAmount: 50000,
        currency: 'USD' as const,
      },
      {
        id: 'camp-002',
        name: 'Kenya Mangrove Restoration',
        totalAmount: 25000,
        currency: 'USD' as const,
      },
      {
        id: 'camp-003',
        name: 'Indonesia Peatland Restoration',
        totalAmount: 37500,
        currency: 'USD' as const,
      },
    ];

    for (const camp of campaigns) {
      this.campaignBudgets.set(camp.id, this.generateBudgetBreakdown(camp));
    }
  }

  private generateBudgetBreakdown(camp: { id: string; name: string; totalAmount: number; currency: 'USD' | 'EUR' | 'GBP' }): BudgetBreakdown {
    const breakdown: BudgetItem[] = [];

    for (const [category, config] of Object.entries(DEFAULT_BUDGET_ALLOCATION)) {
      const cat = category as BudgetCategory;
      const amount = Math.round(camp.totalAmount * config.percentage / 100 * 100) / 100;
      const subItems = this.generateSubItems(cat, amount);
      
      breakdown.push({
        category: cat,
        label: config.label,
        amount,
        percentage: config.percentage,
        description: config.description,
        icon: config.icon,
        color: config.color,
        subItems,
      });
    }

    return {
      campaignId: camp.id,
      campaignName: camp.name,
      totalAmount: camp.totalAmount,
      currency: camp.currency,
      breakdown,
      totalPercentage: breakdown.reduce((sum, item) => sum + item.percentage, 0),
      lastUpdated: new Date().toISOString(),
    };
  }

  private generateSubItems(category: BudgetCategory, totalAmount: number): BudgetSubItem[] {
    const subItemsMap: Record<BudgetCategory, BudgetSubItem[]> = {
      planter: [
        { label: 'Seedlings & Nursery', amount: totalAmount * 0.4, percentage: 40, description: 'Cost of seedlings, nursery operations, and genetic selection' },
        { label: 'Planting Labor', amount: totalAmount * 0.35, percentage: 35, description: 'Wages for planting crews, supervisors, and equipment operators' },
        { label: 'Site Preparation', amount: totalAmount * 0.15, percentage: 15, description: 'Land clearing, soil preparation, and irrigation setup' },
        { label: 'Monitoring & Maintenance (Year 1)', amount: totalAmount * 0.1, percentage: 10, description: 'Watering, weeding, and early survival monitoring' },
      ],
      platform: [
        { label: 'Payment Processing', amount: totalAmount * 0.3, percentage: 30, description: 'Stripe, bank transfer, and crypto payment fees' },
        { label: 'Platform Development', amount: totalAmount * 0.25, percentage: 25, description: 'Frontend, backend, and mobile app development' },
        { label: 'Customer Support', amount: totalAmount * 0.25, percentage: 25, description: 'Sponsor support, planter coordination, and helpdesk' },
        { label: 'Infrastructure & Hosting', amount: totalAmount * 0.2, percentage: 20, description: 'Cloud hosting, CDN, database, and monitoring' },
      ],
      insurance: [
        { label: 'Tree Survival Guarantee', amount: totalAmount * 0.5, percentage: 50, description: 'Replanting fund for trees that die within guarantee period' },
        { label: 'Natural Disaster Coverage', amount: totalAmount * 0.3, percentage: 30, description: 'Coverage for fire, flood, storm, and pest damage' },
        { label: 'Carbon Reversal Reserve', amount: totalAmount * 0.2, percentage: 20, description: 'Buffer for carbon reversal events (fire, disease, logging)' },
      ],
      verification: [
        { label: 'Third-Party Audit', amount: totalAmount * 0.4, percentage: 40, description: 'Annual Verra/Gold Standard audit fees' },
        { label: 'Satellite Monitoring', amount: totalAmount * 0.3, percentage: 30, description: 'Sentinel-2, Planet, and LiDAR imagery analysis' },
        { label: 'Certification & Registry', amount: totalAmount * 0.3, percentage: 30, description: 'VCS/CCB registration and serial number management' },
      ],
      admin: [
        { label: 'Legal & Compliance', amount: totalAmount * 0.4, percentage: 40, description: 'Legal review, contracts, and regulatory compliance' },
        { label: 'Reporting & Analytics', amount: totalAmount * 0.3, percentage: 30, description: 'Impact reports, dashboards, and sponsor communications' },
        { label: 'Operations Overhead', amount: totalAmount * 0.3, percentage: 30, description: 'Office, utilities, insurance, and general administration' },
      ],
    };

    return subItemsMap[category] || [];
  }

  async getBudgetBreakdown(campaignId: string): Promise<BudgetBreakdown | null> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return this.campaignBudgets.get(campaignId) || null;
  }

  async getAllBudgets(): Promise<BudgetBreakdown[]> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return Array.from(this.campaignBudgets.values());
  }

  async calculateSponsorBreakdown(sponsorAmount: number, campaignId: string): Promise<BudgetBreakdown | null> {
    const baseBudget = this.campaignBudgets.get(campaignId);
    if (!baseBudget) return null;

    const scaleFactor = sponsorAmount / baseBudget.totalAmount;
    const scaledBreakdown = baseBudget.breakdown.map(item => ({
      ...item,
      amount: Math.round(item.amount * scaleFactor * 100) / 100,
      subItems: item.subItems?.map(sub => ({
        ...sub,
        amount: Math.round(sub.amount * scaleFactor * 100) / 100,
      })),
    }));

    return {
      ...baseBudget,
      totalAmount: sponsorAmount,
      breakdown: scaledBreakdown,
    };
  }

  async getAvailableCampaigns(): Promise<Array<{ id: string; name: string }>> {
    return Array.from(this.campaignBudgets.entries()).map(([id, budget]) => ({
      id,
      name: budget.campaignName,
    }));
  }
}

export const campaignBudgetService = new CampaignBudgetService();