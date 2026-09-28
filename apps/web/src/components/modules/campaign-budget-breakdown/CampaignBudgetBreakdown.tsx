/**
 * Campaign Budget Breakdown Component
 * 
 * Issue #1004: Campaign budget breakdown - cost transparency
 * 
 * Shows breakdown of sponsor payment with interactive charts:
 * - % to planter
 * - % to platform
 * - % to insurance pool
 * - % to carbon verification
 * Full cost transparency with expandable sub-items.
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as BarTooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  Users, 
  Monitor, 
  Shield, 
  CheckCircle, 
  FileText, 
  PieChart as PieChartIcon,
  BarChart2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Info,
  ArrowRight,
  Calculator,
  Percentage,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  CampaignBudgetService,
  BudgetBreakdown,
  BudgetItem,
  BudgetCategory,
  DEFAULT_BUDGET_ALLOCATION,
  BudgetConfig,
} from '@/services/campaignBudget';

interface CampaignBudgetBreakdownProps {
  campaignId?: string;
  sponsorAmount?: number;
  className?: string;
}

export function CampaignBudgetBreakdown({ 
  campaignId: initialCampaignId, 
  sponsorAmount: initialSponsorAmount,
  className 
}: CampaignBudgetBreakdownProps) {
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(initialCampaignId || '');
  const [sponsorAmount, setSponsorAmount] = useState<number>(initialSponsorAmount || 1000);
  const [budget, setBudget] = useState<BudgetBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAmounts, setShowAmounts] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'comparison'>('overview');
  const [expandedItems, setExpandedItems] = useState<Set<BudgetCategory>>(new Set());

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      loadBudget();
    }
  }, [selectedCampaignId, sponsorAmount]);

  const loadCampaigns = async () => {
    try {
      const campaigns = await campaignBudgetService.getAvailableCampaigns();
      setCampaigns(campaigns);
      if (campaigns.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(campaigns[0].id);
      }
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    }
  };

  const loadBudget = async () => {
    if (!selectedCampaignId) {
      setBudget(null);
      return;
    }

    setLoading(true);
    try {
      let budgetData: BudgetBreakdown | null;
      if (sponsorAmount && sponsorAmount !== 1000) {
        budgetData = await campaignBudgetService.calculateSponsorBreakdown(sponsorAmount, selectedCampaignId);
      } else {
        budgetData = await campaignBudgetService.getBudgetBreakdown(selectedCampaignId);
      }
      setBudget(budgetData);
    } catch (error) {
      console.error('Failed to load budget:', error);
      setBudget(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCampaignChange = (id: string) => {
    setSelectedCampaignId(id);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    setSponsorAmount(value);
  };

  const toggleExpanded = (category: BudgetCategory) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercentage = (pct: number) => {
    return `${pct.toFixed(1)}%`;
  };

  // Chart data for pie chart
  const pieData = useMemo(() => {
    if (!budget) return [];
    return budget.breakdown.map(item => ({
      name: item.label,
      value: item.percentage,
      amount: item.amount,
      color: item.color,
      category: item.category,
    }));
  }, [budget]);

  // Chart data for bar chart
  const barData = useMemo(() => {
    if (!budget) return [];
    return budget.breakdown.map(item => ({
      name: item.label,
      percentage: item.percentage,
      amount: item.amount,
      color: item.color,
      category: item.category,
    }));
  }, [budget]);

  // Total amount display
  const displayTotal = budget ? (showAmounts ? formatCurrency(budget.totalAmount, budget.currency) : '••••••') : 'Loading...';

  if (loading && !budget) {
    return (
      <Card className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </Card>
    );
  }

  if (!budget && selectedCampaignId) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">No budget data available for this campaign</p>
        </CardContent>
      </Card>
    );
  }

  if (!selectedCampaignId) {
    return (
      <Card className="h-64 flex items-center justify-center">
        <div className="text-center">
          <Calculator className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Select a campaign</h3>
          <p className="text-muted-foreground">Choose a campaign to view its budget breakdown</p>
        </div>
      </Card>
    );
  }

  const campaign = campaigns.find(c => c.id === selectedCampaignId);
  const totalPercentage = budget?.breakdown.reduce((sum, item) => sum + item.percentage, 0) || 0;

  return (
    <Card className={cn('space-y-6', className)}>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Campaign Budget Breakdown
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {campaign?.name || 'Select a campaign'} • Total: {displayTotal}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedCampaignId} onValueChange={handleCampaignChange}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Sponsor Amount:</label>
              <div className="flex items-center gap-1">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <input
                  type="number"
                  value={sponsorAmount}
                  onChange={handleAmountChange}
                  min="1"
                  step="100"
                  className="w-32 px-3 py-1.5 border rounded-md bg-background text-sm"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showAmounts}
                onChange={e => setShowAmounts(e.target.checked)}
                className="rounded border-input"
              />
              Show Amounts
            </label>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <StatCard
            label="Total to Planter"
            value={showAmounts ? formatCurrency(budget?.breakdown.find(i => i.category === 'planter')?.amount || 0) : '••••••'}
            percentage={formatPercentage(budget?.breakdown.find(i => i.category === 'planter')?.percentage || 0)}
            icon={Users}
            color="#22c55e"
            showAmounts={showAmounts}
          />
          <StatCard
            label="Platform Fee"
            value={showAmounts ? formatCurrency(budget?.breakdown.find(i => i.category === 'platform')?.amount || 0) : '••••••'}
            percentage={formatPercentage(budget?.breakdown.find(i => i.category === 'platform')?.percentage || 0)}
            icon={Monitor}
            color="#3b82f6"
            showAmounts={showAmounts}
          />
          <StatCard
            label="Insurance Pool"
            value={showAmounts ? formatCurrency(budget?.breakdown.find(i => i.category === 'insurance')?.amount || 0) : '••••••'}
            percentage={formatPercentage(budget?.breakdown.find(i => i.category === 'insurance')?.percentage || 0)}
            icon={Shield}
            color="#f59e0b"
            showAmounts={showAmounts}
          />
          <StatCard
            label="Verification"
            value={showAmounts ? formatCurrency(budget?.breakdown.find(i => i.category === 'verification')?.amount || 0) : '••••••'}
            percentage={formatPercentage(budget?.breakdown.find(i => i.category === 'verification')?.percentage || 0)}
            icon={CheckCircle}
            color="#8b5cf6"
            showAmounts={showAmounts}
          />
        </div>

        <Separator />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList>
            <TabsTrigger value="overview">
              <PieChartIcon className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="details">
              <Percentage className="w-4 h-4 mr-2" />
              Details
            </TabsTrigger>
            <TabsTrigger value="comparison">
              <BarChart2 className="w-4 h-4 mr-2" />
              Compare
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab - Pie Chart */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4" />
                    Budget Allocation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <TooltipProvider>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                            nameKey="name"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number, name: string) => [
                              formatPercentage(value),
                              name,
                            ]}
                          />
                          <Legend />
                        </PieChart>
                      </TooltipProvider>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    {pieData.map((entry, index) => (
                      <Badge key={entry.category} variant="secondary" className="gap-1" style={{ backgroundColor: entry.color + '20', borderColor: entry.color }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        {entry.name} {formatPercentage(entry.value)}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Amount Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <TooltipProvider>
                        <BarChart data={barData} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                          <XAxis type="number" tickFormatter={v => formatCurrency(v)} />
                          <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                          <Tooltip
                            formatter={(value: number) => [formatCurrency(value), 'Amount']}
                          />
                          <Legend />
                          <Bar
                            dataKey="percentage"
                            name="Percentage"
                            layout="vertical"
                            fill="#8884d8"
                          >
                            {barData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </TooltipProvider>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 text-center">
                    Total: {formatPercentage(totalPercentage)} (${formatCurrency(budget?.totalAmount || 0)})
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Details Tab - Expandable Items */}
          <TabsContent value="details" className="space-y-4">
            {budget?.breakdown.map((item, index) => (
              <Card key={item.category}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: item.color + '20' }}
                      >
                        <item.icon className="w-5 h-5" style={{ color: item.color }} />
                      </div>
                      <div>
                        <h3 className="font-semibold">{item.label}</h3>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-lg" style={{ color: item.color }}>
                        {formatPercentage(item.percentage)}
                      </span>
                      <span className="text-muted-foreground">
                        {showAmounts ? formatCurrency(item.amount) : '••••••'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleExpanded(item.category)}
                        aria-expanded={expandedItems.has(item.category)}
                      >
                        {expandedItems.has(item.category) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {expandedItems.has(item.category) && item.subItems && item.subItems.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="space-y-2 pl-10 border-l-2" style={{ borderColor: item.color }}>
                      {item.subItems.map((sub, subIndex) => (
                        <div key={subIndex} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color, opacity: 0.6 }} />
                            <div>
                              <p className="font-medium">{sub.label}</p>
                              <p className="text-xs text-muted-foreground">{sub.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-medium" style={{ color: item.color }}>
                              {formatPercentage(sub.percentage)}
                            </span>
                            <span className="text-muted-foreground">
                              {showAmounts ? formatCurrency(sub.amount) : '••••••'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </TabsContent>

          {/* Comparison Tab */}
          <TabsContent value="comparison" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4" />
                  Compare with Other Campaigns
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Compare budget allocation across different campaigns
                </p>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={pieData} layout="vertical" margin={{ top: 20, right: 30, left: 120, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                    <XAxis type="number" tickFormatter={v => `${v}%`} />
                    <YAxis dataKey="name" type="category" width={150} />
                    <Tooltip formatter={(value: number) => [formatPercentage(value), 'Allocation']} />
                    <Legend />
                    <Bar dataKey="value" fill="#8884d8">
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function StatCard({ 
  label, 
  value, 
  percentage, 
  icon: Icon, 
  color, 
  showAmounts 
}: { 
  label: string; 
  value: string; 
  percentage: string; 
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  showAmounts: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            <p className="text-sm" style={{ color }}>
              {percentage} of total
            </p>
          </div>
          <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
            <icon className="w-6 h-6" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatCurrency(amount: number, currency = 'USD'): string {
  if (amount === undefined || amount === null) return '••••••';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}